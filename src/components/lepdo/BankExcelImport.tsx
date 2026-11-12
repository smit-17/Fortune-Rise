import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload, Download, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLepdo } from "@/lib/lepdo/store";
import { ledgerCategoryOptions } from "@/lib/lepdo/masters";
import { bankFixedDirection, type BankUiCategory } from "@/lib/lepdo/bank";
import { expenseCategoryOptions } from "@/lib/lepdo/expense";
import { loadWorkspace } from "@/lib/lepdo/workspace.functions";
import type { LepdoData, Transaction } from "@/lib/lepdo/types";
import { detectStatementBank, detectHeader, detectColumns, inferImportCategory, canSubmitImport, importSubmitIds, mapImportRows, validateImportRow, importInput, sameBankImport, findImportDuplicate, findImportReview, type ColumnMapping, type Extraction, type ImportField, type ImportRow } from "@/lib/lepdo/bankImport";
import { cn } from "@/lib/utils";

const labels: Record<ImportField,string> = {date:"Date",bank:"Bank",category:"Category",partyName:"Customer / Supplier",particulars:"Particulars / Narration",credit:"Credit",debit:"Debit",amount:"Amount (single column)",direction:"Credit / Debit type",statementClosingBalance:"Statement Closing Balance",reference:"Reference / UTR",notes:"Notes",expenseCategory:"Expense category",destination:"Transfer destination",customCategory:"Custom category"};
type Outcome = { state: "pending" | "saved" | "error"; message: string; input?: ReturnType<typeof importInput> };
export function BankExcelImport({ open, onClose, initialBank }: { open: boolean; onClose: () => void; initialBank: string }) {
  const store = useLepdo(); const currentStore = useRef(store); currentStore.current = store;
  const inputRef = useRef<HTMLInputElement>(null); const busyRef = useRef(false);
  const [fileName,setFileName] = useState(""); const [loading,setLoading] = useState(false); const [busy,setBusy] = useState(false);
  const [error,setError] = useState(""); const [drag,setDrag] = useState(false);
  const [expanded,setExpanded] = useState(false);
  const [sheets,setSheets] = useState<Record<string,unknown[][]>>({}); const [sheet,setSheet] = useState("");
  const [headerRow,setHeaderRow] = useState(0); const [raw,setRaw] = useState<unknown[][]>([]);
  const [mapping,setMapping] = useState<ColumnMapping>({}); const extraction: Extraction = {};
  const [bankId,setBankId] = useState(initialBank === "all" ? "" : initialBank);
  const [rows,setRows] = useState<ImportRow[]>([]); const [selected,setSelected] = useState<Set<string>>(new Set());
  const [outcomes,setOutcomes] = useState<Record<string,Outcome>>({}); const [remoteRows,setRemoteRows] = useState<Transaction[]>([]);
  const manualCategories = useRef(new Set<string>());
  const [reviewed,setReviewed] = useState<Set<string>>(new Set());
  const banks = store.bankAccounts.filter(b => b.active);
  const categories = ledgerCategoryOptions(store.masters,"bankEntryCategories");
  const destinations = [...banks.map(b => ({value:`bank:${b.id}`,label:b.nickname})),...store.cashLocations.filter(c=>c.active).map(c=>({value:`cash:${c.id}`,label:c.name}))];
  const locked = Object.values(outcomes).some(o => o.state === "pending" || o.state === "saved");
  const hasPending = Object.values(outcomes).some(o=>o.state==="pending");
  const reset = () => { setExpanded(false); setFileName(""); setSheets({}); setSheet(""); setHeaderRow(0); setRaw([]); setMapping({}); setRows([]); setSelected(new Set()); setOutcomes({}); setReviewed(new Set()); setRemoteRows([]); setError(""); setBankId(initialBank === "all" ? "" : initialBank); manualCategories.current.clear(); if(inputRef.current) inputRef.current.value=""; };
  const chooseSheet = (name: string, data = sheets) => {
    const grid = data[name] ?? []; const h = detectHeader(grid);
    setBankId(detectStatementBank([name,...grid.slice(0,Math.max(h,0)).flat()],currentStore.current.bankAccounts) ?? (initialBank === "all" ? "" : initialBank));
    if(h < 0) {setError("No transaction header found in this worksheet. Upload a sheet with Date and transaction columns."); setHeaderRow(0);setRaw([]);setRows([]);setMapping({});}
    else {setError("");setHeaderRow(h);setRaw(grid.slice(h+1));setMapping(detectColumns((grid[h]??[]).map(String)));}
    manualCategories.current.clear();
    setSheet(name);setOutcomes({});setReviewed(new Set());
  };
  const readFile = async (file?: File) => {
    if(!file || busyRef.current || hasPending) return;
    if(!/\.(xlsx|xls)$/i.test(file.name)) {setError("Choose an Excel .xlsx or .xls file.");return;}
    if(file.size > 5*1024*1024) {setError("The Excel file must be 5 MB or smaller.");return;}
    setLoading(true);setError("");
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      const data: Record<string,unknown[][]> = {};
      for(const name of workbook.SheetNames) {
        const ws=workbook.Sheets[name]; if(!ws) continue;
        const range=ws["!ref"]; if(range) {const dimensions=XLSX.utils.decode_range(range); if(dimensions.e.r>20000 || dimensions.e.c>200) throw new Error("Sheet is too large. Use up to 20,000 rows and 200 columns.");}
        data[name]=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:"",blankrows:true,raw:true});
      }
      const first=Object.keys(data).find(name=>detectHeader(data[name]??[])>=0)??Object.keys(data)[0]; if(!first) throw new Error("Workbook has no worksheets.");
      setSheets(data);setFileName(file.name);setOutcomes({});chooseSheet(first,data);
    } catch(e) {setError(e instanceof Error ? e.message : "Unable to read this workbook.");}
    finally {setLoading(false);}
  };
  useEffect(()=>{ if(open) reset(); },[open]);
  useEffect(()=>{
    if(!raw.length || locked) return;
    setRows(mapImportRows(raw,mapping,extraction,{bankId,banks:store.bankAccounts,parties:store.parties,categories,masters:store.masters,headerRow,transactions:store.transactions}));setSelected(new Set());setOutcomes({});setReviewed(new Set());
  },[raw,mapping,bankId,headerRow]);
  const statuses = useMemo(()=>{
    const result = new Map<string,{kind:string;message:string}>(); const seen: ImportRow[]=[];
    for(const row of rows) {
      const outcome=outcomes[row.id];
      if(outcome) {result.set(row.id,{kind:outcome.state,message:outcome.message}); if(outcome.state!=="error") {seen.push(row);continue;}}
      const invalid=validateImportRow(row,banks.map(b=>b.id),destinations.map(d=>d.value));
      const duplicate=findImportDuplicate(row,[...store.transactions,...remoteRows]);
      const fileDuplicate=seen.find(r=>sameBankImport(importInput(r,null),importInput(row,null)));
      if(duplicate || fileDuplicate) result.set(row.id,{kind:"duplicate",message:duplicate ? `Duplicate: ${duplicate.code}` : `Duplicate of file row ${fileDuplicate?.rowNumber}`});
      else if(invalid) result.set(row.id,{kind:"invalid",message:invalid});
      else if(!reviewed.has(row.id) && findImportReview(row,[...store.transactions,...remoteRows])) result.set(row.id,{kind:"review",message:"Possible existing entry — statement balance unavailable"});
      else result.set(row.id,{kind:"ready",message:"Ready"});
      if(!invalid) seen.push(row);
    }
    return result;
  },[rows,outcomes,reviewed,store.transactions,remoteRows,store.bankAccounts,store.cashLocations]);
  const eligible=rows.filter(r=>statuses.get(r.id)?.kind==="ready");
  const submitIds=importSubmitIds(rows,statuses,selected);
  const canSubmit=canSubmitImport([...statuses.values()].map(s=>s.kind),submitIds.length)&&!busy&&!loading&&!hasPending&&store.ready&&!store.syncError;
  const showParty=true;
  const showExpense=true;
  const showDestination=rows.some(r=>r.category==="bank_transfer");
  const update = (id:string,patch:Partial<ImportRow>) => {setReviewed(prev=>{const next=new Set(prev);next.delete(id);return next;});setRows(prev=>prev.map(r=>r.id===id?(()=>{const next={...r,...patch};return !manualCategories.current.has(id) && ("particulars" in patch||"accountId" in patch||"credit" in patch||"debit" in patch||"partyName" in patch)?{...next,...inferImportCategory(next,{transactions:currentStore.current.transactions,parties:currentStore.current.parties,categories,masters:currentStore.current.masters})}:next;})():r));setOutcomes(prev=>{const next={...prev};delete next[id];return next;});};
  const mark = (id:string,value:Outcome)=>setOutcomes(prev=>({...prev,[id]:value}));
  const confirm = async (id:string,input:ReturnType<typeof importInput>): Promise<boolean> => {
    for(let attempt=0;attempt<16;attempt++) {
      await new Promise(resolve=>setTimeout(resolve,500));
      try { const snapshot=await loadWorkspace(); const tx=(snapshot.json ? JSON.parse(snapshot.json) as LepdoData : null)?.transactions??[];
        setRemoteRows(tx);
        if(tx.some(t=>!t.voided && t.sourceType==="bank" && sameBankImport(input,t))) {mark(id,{state:"saved",message:"Imported — saved",input});return true;}
      } catch { /* Remain pending; never re-add an uncertain write. */ }
    }
    mark(id,{state:"pending",message:"Awaiting save confirmation — do not re-add",input});return false;
  };
  const add = async (ids:string[]) => {
    if(busyRef.current || store.syncError || !store.ready) return;
    busyRef.current=true;setBusy(true);setError("");
    try {
      const snapshot=await loadWorkspace(); const tx=(snapshot.json ? JSON.parse(snapshot.json) as LepdoData : null)?.transactions??[];setRemoteRows(tx);
      const accepted: ReturnType<typeof importInput>[]=[];
      for(const id of ids) {
        const row=rows.find(r=>r.id===id); if(!row || outcomes[id]?.state==="saved") continue;
        const pending=outcomes[id]; if(pending?.state==="pending" && pending.input) {if(!await confirm(id,pending.input)) break;continue;}
        const s=currentStore.current; const invalid=validateImportRow(row,s.bankAccounts.map(b=>b.id),destinations.map(d=>d.value));
        if(invalid) {mark(id,{state:"error",message:invalid});continue;}
        if(!reviewed.has(id) && findImportReview(row,[...tx,...s.transactions])) {mark(id,{state:"error",message:"Review possible existing entry before adding"});continue;}
        let input=importInput(row,null);
        if([...tx,...s.transactions].some(t=>!t.voided && t.sourceType==="bank" && sameBankImport(input,t)) || accepted.some(t=>sameBankImport(input,t))) {continue;}
        let partyId:string|null=null;
        if(row.category==="sale_payment" || row.category==="purchase_payment") {
          const name=row.partyName.trim();partyId=s.parties.find(p=>p.name.toLowerCase()===name.toLowerCase())?.id??s.addParty(name,row.category==="sale_payment"?"customer":"supplier").id;
        }
        input=importInput(row,partyId);
        const result=s.addEntry(input);
        if(!result.ok) {mark(id,{state:"error",message:result.message});continue;}
        accepted.push(input);mark(id,{state:"pending",message:"Saving…",input});
        if(!await confirm(id,input)) {setError("Import paused until the last entry is confirmed saved. Use Check Save Status; it will not add the entry again.");break;}
      }
    } catch(e) {setError(e instanceof Error?e.message:"Import paused. Your confirmed rows remain saved.");}
    finally {busyRef.current=false;setBusy(false);}
  };
  const template=async()=>{const XLSX=await import("@e965/xlsx");const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Date","Bank","Category","Customer","Narration","Credit","Debit","Statement Closing Balance","Reference / UTR","Expense Category","Transfer Destination","Notes"]]),"Bank Entries");XLSX.writeFile(wb,"bank-import-template.xlsx");};
  const dropdown=(label:string,value:string,options:{value:string;label:string}[],onChange:(v:string)=>void,disabled=false)=><Select value={value||"__empty__"} onValueChange={v=>onChange(v==="__empty__"?"":v)} disabled={disabled}><SelectTrigger aria-label={label} className="h-8 min-w-36 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__empty__">Select…</SelectItem>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
  const field=(row:ImportRow,key:keyof ImportRow,type="text")=><Input aria-label={`${labels[key as ImportField]??key} row ${row.rowNumber}`} type={type} className="h-8 min-w-36 text-xs" value={row[key]} disabled={busy || ["pending","saved"].includes(outcomes[row.id]?.state??"")} onChange={e=>update(row.id,{[key]:e.target.value})}/>;
  return <Dialog open={open} onOpenChange={o=>{if(!o && !busy) onClose();}}><DialogContent className="flex max-h-[92dvh] w-[96vw] min-w-0 max-w-[1500px] flex-col gap-3 overflow-hidden p-4 sm:p-6" onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}>
    <DialogHeader><DialogTitle>Excel Import — Bank Ledger</DialogTitle><DialogDescription>{fileName || "Upload bank transactions"}</DialogDescription></DialogHeader>
    <div className={cn("min-h-0 min-w-0 w-full flex-1 space-y-4 overflow-x-hidden overflow-y-auto",expanded&&"flex flex-col overflow-y-hidden")}>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" aria-label="Excel file" disabled={loading||busy||hasPending} onChange={e=>void readFile(e.target.files?.[0])}/>
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!loading && !busy && !hasPending) void readFile(e.dataTransfer.files[0]);}} className={cn(fileName?"flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-primary/60 px-4 py-2 text-left":"flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-primary/60 py-6 text-center",drag&&"bg-accent",expanded&&"hidden")}>
        <div className={cn("flex min-w-0 items-center gap-2",!fileName&&"flex-col")}><FileSpreadsheet className={cn("shrink-0 text-primary",fileName?"size-5":"size-9")}/><p className="truncate text-sm font-medium">{loading?"Reading workbook…":fileName || "Drag and drop an Excel file"}</p>
        {!fileName?<p className="text-xs text-muted-foreground">.xlsx / .xls · Maximum 5 MB</p>:null}</div>
        <div className="flex max-w-full flex-row items-center gap-2 overflow-x-auto">
      {Object.keys(sheets).length>1?dropdown("Worksheet",sheet,Object.keys(sheets).map(s=>({value:s,label:s})),chooseSheet,locked||busy):null}
      {!fileName?<Button variant="outline" disabled={loading||busy||hasPending} onClick={()=>inputRef.current?.click()}><Upload className="size-4"/>Browse File</Button>:null}
      <Button variant="ghost" onClick={()=>void template()}><Download className="size-4"/>Sample Template</Button>
      {rows.some(r=>statuses.get(r.id)?.kind==="review")?<Button variant="outline" disabled={busy||hasPending} onClick={()=>{const ids=rows.filter(r=>statuses.get(r.id)?.kind==="review").map(r=>r.id);if(window.confirm(`Review rows ${rows.filter(r=>ids.includes(r.id)).map(r=>r.rowNumber).join(", ")}: matching existing entries have no statement balance. Confirm these are separate transactions?`))setReviewed(prev=>new Set([...prev,...ids]));}}>Review</Button>:null}
      {hasPending?<Button variant="outline" disabled={busy} onClick={()=>void add(Object.keys(outcomes).filter(id=>outcomes[id]?.state==="pending"))}><RotateCcw className="size-4"/>Check Save Status</Button>:null}
          <Button variant="ghost" disabled={busy||hasPending} onClick={reset}>Remove & New</Button>
        </div>
      </div>
      {error?<p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>:null}
      {fileName?<>
        <div className="flex shrink-0 items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{rows.length} rows · {eligible.length} ready · {Object.values(outcomes).filter(o=>o.state==="saved").length} imported · {[...statuses.values()].filter(s=>s.kind==="duplicate").length} duplicates</p>
        {store.syncError?<p role="alert" className="text-sm text-destructive">{store.syncError}</p>:null}
        <Button variant="outline" className="size-8" size="icon" aria-label={expanded?"Collapse import preview":"Expand import preview"} aria-expanded={expanded} aria-controls="bank-import-preview" title={expanded?"Collapse import preview":"Expand import preview"} onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronDown className="size-4"/>:<ChevronUp className="size-4"/>}</Button></div>
        <div id="bank-import-preview" className={cn("max-h-[55dvh] min-h-[240px] w-full max-w-full overflow-auto rounded-md border border-border",expanded&&"min-h-0 max-h-none flex-1 basis-[68dvh]")}><table className="w-full text-xs"><thead className="sticky top-0 z-20 bg-muted shadow-[0_1px_0_var(--border)]"><tr><th className="p-2"><Checkbox aria-label="Select all ready rows" disabled={busy||hasPending||!eligible.length} checked={eligible.length>0&&eligible.every(r=>selected.has(r.id))} onCheckedChange={checked=>setSelected(checked?new Set(eligible.map(r=>r.id)):new Set())}/></th>{["Row","Date","Bank","Category","Entry type",...(showExpense?["Expense category"]:[]),...(showParty?["Customer / Supplier"]:[]),...(showDestination?["Destination"]:[]),"Particulars","Amount","Reference / UTR (optional)","Notes (optional)","Statement Closing Balance","Action"].map(h=><th key={h} className={cn("whitespace-nowrap bg-muted p-2 text-left",h==="Action"&&"sticky right-0 z-10")}>{h}</th>)}</tr></thead><tbody>{rows.map(row=>{const status=statuses.get(row.id);const disabled=busy||["pending","saved"].includes(outcomes[row.id]?.state??"");const direction=row.debit!==""?"out":"in";const existing=!!findImportDuplicate(row,[...store.transactions,...remoteRows]);const alreadyAdded=existing||["saved","duplicate","review"].includes(status?.kind??"");return <tr key={row.id} title={status?.message} aria-label={`Row ${row.rowNumber}: ${status?.message}`} className={cn("border-t border-border",alreadyAdded&&"bg-pl-import-added")}>
          <td className="p-2"><Checkbox aria-label={`Select row ${row.rowNumber}`} checked={selected.has(row.id)} disabled={disabled||!eligible.some(r=>r.id===row.id)||hasPending} onCheckedChange={checked=>setSelected(prev=>{const next=new Set(prev);if(checked)next.add(row.id);else next.delete(row.id);return next;})}/></td><td className="p-2">{row.rowNumber}</td><td className="p-2">{field(row,"date","date")}</td><td className="p-2">{dropdown(`Bank row ${row.rowNumber}`,row.accountId,banks.map(b=>({value:b.id,label:b.nickname})),v=>update(row.id,{accountId:v}),disabled)}</td>
          <td className="p-2">{dropdown(`Category row ${row.rowNumber}`,row.customCategory?`custom:${row.customCategory}`:row.category,ledgerCategoryOptions(store.masters,"bankEntryCategories",{category:row.category,custom:row.customCategory}),v=>{
            manualCategories.current.add(row.id);
            const category=v.startsWith("custom:")?"other":v as BankUiCategory;
            const fixed=bankFixedDirection(category);const amount=row.credit||row.debit||"0";
            const partyType=category==="sale_payment"?"customer":category==="purchase_payment"?"supplier":null;
            const partyName=store.parties.some(p=>p.type===partyType&&p.name===row.partyName)?row.partyName:"";
            update(row.id,{category,partyName,customCategory:v.startsWith("custom:")?v.slice(7):"",destination:"",...(fixed==="in"?{credit:amount,debit:""}:fixed==="out"?{credit:"",debit:amount}:{})});
          },disabled)}</td>
          <td className="p-2">{dropdown(`Entry type row ${row.rowNumber}`,direction,[{value:"in",label:row.category==="uchhina"?"Credit — Received back":"Credit — Money In"},{value:"out",label:row.category==="uchhina"?"Debit — Given":"Debit — Money Out"}],v=>{const amount=row.credit||row.debit||"0";update(row.id,v==="in"?{credit:amount,debit:""}:{credit:"",debit:amount});},disabled||!!bankFixedDirection(row.category))}</td>
          {showExpense?<td className="min-w-36 p-2">{dropdown(`Expense category row ${row.rowNumber}`,row.category==="expense"?row.expenseCategory:"",expenseCategoryOptions(store.masters,row.expenseCategory).map(c=>({value:c,label:c})),v=>update(row.id,{expenseCategory:v}),disabled||row.category!=="expense")}</td>:null}
          {showParty?<td className="p-2">{dropdown(`Customer / Supplier row ${row.rowNumber}`,["sale_payment","purchase_payment"].includes(row.category)?row.partyName:"",Array.from(new Set([...store.parties.filter(p=>p.type===(row.category==="sale_payment"?"customer":"supplier")).map(p=>p.name),...(row.partyName?[row.partyName]:[])])).map(name=>({value:name,label:name})),v=>update(row.id,{partyName:v}),disabled||!["sale_payment","purchase_payment"].includes(row.category))}</td>:null}
          {showDestination?<td className="p-2">{row.category==="bank_transfer"?dropdown(`Destination row ${row.rowNumber}`,row.destination,destinations,v=>update(row.id,{destination:v}),disabled):null}</td>:null}
          <td className="p-2">{field(row,"particulars")}</td><td className="p-2"><Input aria-label={`Amount row ${row.rowNumber}`} type="number" step="any" className="h-8 min-w-36 text-xs" value={direction==="in"?row.credit:row.debit} disabled={disabled} onChange={e=>update(row.id,direction==="in"?{credit:e.target.value}:{debit:e.target.value})}/></td><td className="p-2">{field(row,"reference")}</td><td className="p-2">{field(row,"notes")}</td><td className="p-2">{field(row,"statementClosingBalance","number")}</td>
          <td className={cn("sticky right-0 p-2",alreadyAdded?"bg-pl-import-added":"bg-background")}><Button size="sm" aria-label={`Add row ${row.rowNumber}`} disabled={status?.kind!=="ready"||busy||loading||hasPending||!store.ready||!!store.syncError} onClick={()=>void add([row.id])}>{status?.kind==="saved"||existing?"Added":status?.kind==="pending"?"Saving…":"Add"}</Button></td>
        </tr>;})}</tbody></table></div>
      </>:null}
    </div>
    <DialogFooter className="block shrink-0 border-t border-border pt-3"><div className="flex w-max min-w-full flex-row items-center justify-end gap-2">
      <Button disabled={!canSubmit} onClick={()=>{if(canSubmit)void add(submitIds);}}>{busy?"Importing…":"Submit"}</Button>
      <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
    </div></DialogFooter>
  </DialogContent></Dialog>;
}
