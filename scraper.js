const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeProgramma() {
  console.log('🔄 Ξεκινάω το scraping...');
  
  try {
    const response = await axios.get('https://programmatv.gr/athlitika/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000
    });

    console.log('✅ Σελίδα φορτώθηκε, μέγεθος:', response.data.length);

    // ΑΠΟΘΗΚΕΥΟΥΜΕ ΤΟ HTML ΠΑΝΤΑ ΓΙΑ DEBUG
    fs.writeFileSync('debug.html', response.data);
    console.log('💾 Αποθηκεύτηκε debug.html');

    const $ = cheerio.load(response.data);
    const games = [];

    // 1. ΒΡΕΣ ΟΛΕΣ ΤΙΣ ΩΡΕΣ
    console.log('🔍 Ψάχνω για ώρες...');
    const timePattern = /\d{1,2}:\d{2}/g;
    const allText = $('body').text();
    const times = allText.match(timePattern) || [];
    console.log(`📊 Βρέθηκαν ${times.length} ώρες στο κείμενο`);

    // 2. ΠΑΡΕ ΟΛΟ ΤΟ ΚΕΙΜΕΝΟ ΚΑΙ ΨΑΞΕ ΓΙΑ ΠΑΙΧΝΙΔΙΑ
    const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    console.log(`📊 Βρέθηκαν ${lines.length} γραμμές κειμένου`);

    // Ψάχνουμε γραμμές που περιέχουν ώρα και παύλα
    lines.forEach(line => {
      if (line.match(/\d{1,2}:\d{2}/) && (line.includes('-') || line.includes('–') || line.includes('vs'))) {
        console.log(`🔍 Βρέθηκε γραμμή: "${line.substring(0, 100)}..."`);
        
        // Βγάζουμε την ώρα
        const timeMatch = line.match(/\d{1,2}:\d{2}/);
        const time = timeMatch ? timeMatch[0] : '';
        
        // Χωρίζουμε τις ομάδες
        const parts = line.split(/\s*[-–]\s*/);
        if (parts.length >= 2) {
          // Η πρώτη είναι η ώρα + home, η δεύτερη away
          const firstPart = parts[0].replace(/\d{1,2}:\d{2}/, '').trim();
          const away = parts[parts.length - 1].trim();
          
          if (firstPart && away && firstPart.length > 1 && away.length > 1) {
            games.push({ time, home: firstPart, away });
          }
        }
      }
    });

    // 3. ΑΝ ΔΕΝ ΒΡΗΚΕ, ΨΑΞΕ ΣΕ ΠΙΝΑΚΕΣ
    if (games.length === 0) {
      console.log('🔍 Ψάχνω σε πίνακες...');
      $('table, tbody, .table, .schedule, .program').each((i, table) => {
        $(table).find('tr').each((j, row) => {
          const cells = $(row).find('td, th');
          if (cells.length >= 3) {
            const text1 = $(cells[0]).text().trim();
            const text2 = $(cells[1]).text().trim();
            const text3 = $(cells[2]).text().trim();
            
            // Έλεγχος αν το πρώτο κελί έχει ώρα
            if (text1.match(/\d{1,2}:\d{2}/) && text2.length > 1 && text3.length > 1) {
              games.push({ time: text1, home: text2, away: text3 });
            }
          }
        });
      });
    }

    // 4. ΑΝ ΔΕΝ ΒΡΗΚΕ, ΨΑΞΕ ΓΙΑ ΠΑΤΕΡΝΑ ΜΕ SPANS
    if (games.length === 0) {
      console.log('🔍 Ψάχνω σε spans...');
      $('span, div').each((i, el) => {
        const text = $(el).text().trim();
        if (text.match(/\d{1,2}:\d{2}/) && text.length < 30) {
          const parent = $(el).parent();
          const allText = parent.text().trim();
          const parts = allText.split(/\s*[-–]\s*/);
          if (parts.length >= 2) {
            const timeMatch = text.match(/\d{1,2}:\d{2}/);
            const time = timeMatch ? timeMatch[0] : '';
            const home = parts[0].replace(/\d{1,2}:\d{2}/, '').trim();
            const away = parts[parts.length - 1].trim();
            if (home && away && home.length > 1 && away.length > 1) {
              games.push({ time, home, away });
            }
          }
        }
      });
    }

    // 5. ΑΦΑΙΡΕΣΗ ΔΙΠΛΟΤΥΠΩΝ
    const seen = new Set();
    const cleanGames = games
      .filter(g => g.time && g.home && g.away && g.home.length > 1 && g.away.length > 1)
      .filter(g => {
        const key = `${g.time}-${g.home}-${g.away}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 25)
      .map(g => ({
        time: g.time || '--:--',
        home: g.home.substring(0, 35),
        away: g.away.substring(0, 35)
      }));

    console.log(`🎯 Βρέθηκαν ${cleanGames.length} παιχνίδια`);

    // 6. ΑΠΟΘΗΚΕΥΣΗ
    const data = {
      date: new Date().toISOString().split('T')[0],
      updated: new Date().toISOString(),
      total: cleanGames.length,
      games: cleanGames
    };

    fs.writeFileSync('programma.json', JSON.stringify(data, null, 2));
    console.log('💾 Αποθηκεύτηκε programma.json');

    // 7. ΕΚΤΥΠΩΣΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ
    if (cleanGames.length > 0) {
      console.log('📋 Παιχνίδια που βρέθηκαν:');
      cleanGames.slice(0, 10).forEach((g, i) => {
        console.log(`  ${i+1}. ${g.time} - ${g.home} vs ${g.away}`);
      });
    } else {
      console.log('⚠️ ΔΕΝ βρέθηκαν παιχνίδια!');
      // Αποθήκευσε τις πρώτες 50 γραμμές για έλεγχο
      const sampleLines = lines.slice(0, 50).join('\n');
      fs.writeFileSync('debug_text.txt', sampleLines);
      console.log('💾 Αποθηκεύτηκε debug_text.txt με δείγμα κειμένου');
    }

  } catch (error) {
    console.error('❌ ΣΦΑΛΜΑ:', error.message);
    const data = {
      date: new Date().toISOString().split('T')[0],
      updated: new Date().toISOString(),
      total: 0,
      games: [],
      error: error.message
    };
    fs.writeFileSync('programma.json', JSON.stringify(data, null, 2));
    process.exit(0);
  }
}

scrapeProgramma();
