export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @font-face { font-family: "Inter"; font-weight: 400 700; font-display: swap; src: url("/fonts/inter-latin-400-normal.woff2") format("woff2"); }
      body { font: 15px/1.5 "Inter", system-ui, -apple-system, sans-serif; background: #FAF7F5; color: #17181C; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; color: #2329A8; }
      p { color: #5E636A; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #2329A8; color: #fff; }
      .secondary { background: #fff; color: #2329A8; border-color: #CACBCC; }
      a:focus-visible, button:focus-visible { outline: 2px solid #355CF5; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
