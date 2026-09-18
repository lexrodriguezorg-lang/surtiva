import {invitationHandler} from './handler.mjs';
// Custom authorization: manager JWT for creation; one-use capability for exchange.
Deno.serve(invitationHandler({
 url:Deno.env.get('SUPABASE_URL')!,
 serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 publicKey:Deno.env.get('SUPABASE_ANON_KEY')!,
}));
