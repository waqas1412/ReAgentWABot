const { createClient } = require('@supabase/supabase-js');
const { config } = require('./environment');

// Initialize Supabase client for user operations (with anon key)
const supabase = createClient(config.database.url, config.database.anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  }
});

// Initialize Supabase client for admin operations (with service role key)
const supabaseAdmin = createClient(config.database.url, config.database.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test database connection
const testConnection = async () => {
  try {
    // Test with anon key first
    const { data, error } = await supabase
      .from('user_roles')
      .select('id')
      .limit(1);
    
    if (error && error.code !== 'PGRST301') { // PGRST301 = no matching rows, which is OK
      console.warn('Database connection test with anon key:', error.message);
    }
    
    // Test with admin key
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .limit(1);
    
    if (adminError && adminError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.warn('Database admin connection test failed:', adminError.message);
      return false;
    }
    
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
};

module.exports = {
  supabase,        // For user operations with RLS
  supabaseAdmin,   // For admin operations bypassing RLS
  testConnection
}; 