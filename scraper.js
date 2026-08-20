const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeProgramma() {
  console.log('🔄 Ξεκινάω το scraping με τη σωστή δομή...');
  
  try {
    const response = await axios.get('https://programmatv.gr/athlitika/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000
    });

    console.log('✅ Σελίδα φορτώθηκε, μέγεθος:', response.data.length);

    const $ = cheerio.load(response.data);
    const games = [];

    // Βρίσκουμε όλα τα cards
    $('.ptv-sport-card').each((i, el) => {
      // Βγάζουμε τα στοιχεία
      const channel = $(el).find('.ptv-card-channel').text().trim();
      const time = $(el).find('.ptv-card-time').text().trim();
      const title = $(el).find('.ptv-card-title').text().trim();
      const sport = $(el).find('.ptv-card-sport-tag').text().trim();
      
      // Καθαρίζουμε την ώρα (παίρνουμε μόνο την έναρξη)
      let cleanTime = time;
      if (time.includes('—')) {
        cleanTime = time.split('—')[0].trim();
      }
      
      // Ψάχνουμε να βρούμε τις ομάδες από τον τίτλο
      let home = '';
      let away = '';
      
      // Αν ο τίτλος έχει " – " ή " - " ή " vs "
      if (title.includes(' – ') || title.includes(' - ') || title.includes(' vs ')) {
        const parts = title.split(/\s*[–-]\s*|\s*vs\s*/i);
        if (parts.length >= 2) {
          home = parts[0].trim();
          away = parts[parts.length - 1].trim();
        }
      }
      
      // Αν ο τίτλος έχει " : " (π.χ. "Ποδόσφαιρο: Κροατία – Πολωνία")
      if (!home && title.includes(':')) {
        const parts = title.split(':');
        if (parts.length >= 2) {
          const rest = parts.slice(1).join(':').trim();
          const teamParts = rest.split(/\s*[–-]\s*|\s*vs\s*/i);
          if (teamParts.length >= 2) {
            home = teamParts[0].trim();
            away = teamParts[teamParts.length - 1].trim();
          }
        }
      }
      
      // Φιλτράρουμε μόνο τα αθλητικά (όχι εκπομπές)
      const isSport = sport === 'Ποδόσφαιρο' || sport === 'Μπάσκετ' || sport === 'Τένις' || 
                      sport === 'Βόλεϊ' || sport === 'Αθλητικά' || sport === 'LIVE' ||
                      sport.includes('Nations') || sport.includes('League');
      
      // Αν έχει ομάδες και είναι αθλητικό, το προσθέτουμε
      if (home && away && home.length > 1 && away.length > 1 && isSport) {
        games.push({
          time: cleanTime || '--:--',
          home: home.substring(0, 35),
          away: away.substring(0, 35),
          channel: channel,
          sport: sport,
          title: title.substring(0, 50)
        });
      }
    });

    console.log(`🎯 Βρέθηκαν ${games.length} παιχνίδια`);

    // Καθαρισμός διπλότυπων
    const seen = new Set();
    const cleanGames = games
      .filter(g => g.time && g.home && g.away)
      .filter(g => {
        const key = `${g.time}-${g.home}-${g.away}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30)
      .map(g => ({
        time: g.time,
        home: g.home,
        away: g.away,
        channel: g.channel || '—'
      }));

    // Αν βρήκε παιχνίδια, τα αποθηκεύουμε
    if (cleanGames.length > 0) {
      const data = {
        date: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString(),
        total: cleanGames.length,
        games: cleanGames
      };

      fs.writeFileSync('programma.json', JSON.stringify(data, null, 2));
      console.log('💾 Αποθηκεύτηκε programma.json με', cleanGames.length, 'παιχνίδια');
      
      // Εκτύπωση των πρώτων 5 για έλεγχο
      console.log('📋 Πρώτα 5 παιχνίδια:');
      cleanGames.slice(0, 5).forEach((g, i) => {
        console.log(`  ${i+1}. ${g.time} - ${g.home} vs ${g.away} (${g.channel})`);
      });
    } else {
      // Αν δεν βρήκε, αποθηκεύουμε το HTML για debugging
      fs.writeFileSync('debug.html', response.data);
      console.log('⚠️ ΔΕΝ βρέθηκαν παιχνίδια! Αποθηκεύτηκε debug.html');
      
      const data = {
        date: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString(),
        total: 0,
        games: []
      };
      fs.writeFileSync('programma.json', JSON.stringify(data, null, 2));
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
