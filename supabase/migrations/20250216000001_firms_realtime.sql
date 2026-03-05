-- Enable Realtime for firms so company dashboard can react instantly when super admin pauses/resumes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.firms;
