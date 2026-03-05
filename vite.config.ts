import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
  server: {
    host: "::",
    port: 3000,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://ypdlbqrcxnugrvllbmsi.supabase.co'),
    // 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZGxicXJjeG51Z3J2bGxibXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTI2MDcsImV4cCI6MjA4MzE2ODYwN30.7fc-jebaFfmCKEjC2RicQNlrXQc-iOq7ZSy46HQwM90'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
    'import.meta.env.VITE_APP_NAME': JSON.stringify('Engineering Project Management'),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify('1.0.0'),
    // EmailJS Configuration - Loaded from .env file
    'import.meta.env.VITE_EMAILJS_SERVICE_ID': JSON.stringify(env.VITE_EMAILJS_SERVICE_ID || ''),
    'import.meta.env.VITE_EMAILJS_TEMPLATE_ID': JSON.stringify(env.VITE_EMAILJS_TEMPLATE_ID || ''),
    'import.meta.env.VITE_EMAILJS_PUBLIC_KEY': JSON.stringify(env.VITE_EMAILJS_PUBLIC_KEY || ''),
  },
  };
});

