// js/supabase.js
const SUPABASE_URL = 'https://tlaewkkgumwxicrlacub.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYWV3a2tndW13eGljcmxhY3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjQ0MTksImV4cCI6MjEwMjQ0MDQxOX0.5mHZeyhDjllvaybB7bg8RKTa2s_GS-zXrWITSvCb8w0';

if (typeof supabase !== 'undefined') {
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.error("Supabase SDK is not loaded.");
}
