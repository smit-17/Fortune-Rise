ALTER POLICY "Signed-in users read role permissions"
ON public.role_permissions
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), role)
  OR public.has_permission((SELECT auth.uid()), 'users.view')
);
