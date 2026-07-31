import { supabase } from './supabaseConfig';

export async function logAudit(action, module, description) {
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from('profiles')
    .select('email,role')
    .eq('id', user.id)
    .single();

  await supabase.from('audit_logs').insert({
    user_id: user.id,
    user: `${data.email} (${data.role.charAt(0).toUpperCase()+data.role.slice(1)})`,
    action,
    module,
    description
  });
}
