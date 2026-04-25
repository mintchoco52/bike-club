import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gkvqjbldrxsglbgfnfai.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdnFqYmxkcnhzZ2xiZ2ZuZmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTMzNTQsImV4cCI6MjA5MjY2OTM1NH0.L4sF1d3ND2UPDmCmVBuhGrQn3dFrG5fmR7ujXzE1-ag'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
