import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { createSmsHookHandler } from '../_shared/sms-hook.js';

Deno.serve(createSmsHookHandler({
  verifyWebhook: (raw, headers, secret) => new Webhook(secret).verify(raw, headers),
  getHookSecrets: () => Deno.env.get('SEND_SMS_HOOK_SECRETS'),
  getProviderCredentials: () => ({
    username: Deno.env.get('MELIPAYAMAK_USERNAME'),
    password: Deno.env.get('MELIPAYAMAK_PASSWORD'),
  }),
}));
