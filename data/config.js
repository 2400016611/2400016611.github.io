// 后端配置。这两个值都是「可以公开」的：anon key 走到哪里都会被看到，
// 真正拦住陌生人的是数据库里的门禁规则（RLS，见 supabase/migrations/0001_init.sql）。
//
// 想临时关掉后端、回到纯静态站：把 url 改成空字符串即可。
window.SITE_BACKEND = {
  url: "https://dfmkmmpiwtknatiqohaj.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmbWttbXBpd3RrbmF0aXFvaGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NTk4NzIsImV4cCI6MjEwNzQzNTg3Mn0.6bHX2IZ0hbMskaha9fNKRjkugdqglm746spuZOD4gjA",
  // 也可以换成新版可发布密钥（效果一样）：sb_publishable_3J6Lea65--uGFMj1G8A8UA_VT1YAZ9F
  bucket: "media"
};
