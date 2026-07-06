const dns = require('dns');

console.log('Testing DNS resolution for Supabase...\n');

dns.lookup('lkpuepevvzeulhiiyvnf.supabase.co', (err, address, family) => {
  if (err) {
    console.error('❌ DNS lookup failed:', err.message);
    console.log('\nTrying with system resolver...');

    dns.resolve4('lkpuepevvzeulhiiyvnf.supabase.co', (err2, addresses) => {
      if (err2) {
        console.error('❌ DNS resolve also failed:', err2.message);
      } else {
        console.log('✅ Resolved to:', addresses);
      }
    });
  } else {
    console.log('✅ DNS lookup successful!');
    console.log(`   Address: ${address}`);
    console.log(`   Family: IPv${family}`);
  }
});

// Also test supabase.co (parent domain)
dns.lookup('supabase.co', (err, address, family) => {
  if (err) {
    console.error('\n❌ Even supabase.co failed:', err.message);
  } else {
    console.log('\n✅ supabase.co works fine');
    console.log(`   Address: ${address}`);
  }
});
