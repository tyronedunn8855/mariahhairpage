/* Supabase connection for her booking calendar and owner panel (/admin/).
   Fill these from her own Supabase project: Project Settings > API Keys (Project URL and the publishable key).
   The publishable key is meant to be public: Row Level Security (supabase/setup-all.sql) decides what it can do.
   Never paste a secret or service_role key here. While these are empty, the site shows its built-in menu and
   policies, and booking falls back to texting her. */
window.ML_SUPABASE = {
  url: 'https://tlejxxlylcmkitlaintr.supabase.co',
  anonKey: 'sb_publishable_t15X_wHzz1S6Wm_BFRhpaw_QjHzMBBV',
  // Public half of the alert key pair. The private half lives only in Vercel (VAPID_PRIVATE_KEY).
  vapidKey: 'BKYvSud78wmdn_0nB_I0zQL1Avr8818h0fXWFxh9Jc9z0SY3dchUARsk4mcDzfCpRsAFd0lZAGO79IVKwfxXXns'
};
