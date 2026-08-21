const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeProgramma() {
  console.log('🔄 Ξεκινάω το scraping με διοργανώσεις...');
  
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
      // Βασικά στοιχεία
      const channel = $(el).find('.ptv-card-channel').text().trim();
      const time = $(el).find('.ptv-card-time').text().trim();
      const title = $(el).find('.ptv-card-title').text().trim();
      const sport = $(el).find('.ptv-card-sport-tag').text().trim();
      const desc = $(el).find('.ptv-card-desc').text().trim();
      
      // Καθαρίζουμε την ώρα
      let cleanTime = time;
      if (time.includes('—')) {
        cleanTime = time.split('—')[0].trim();
      }
      
      // Βρίσκουμε τη διοργάνωση από την περιγραφή
      let league = '';
      if (desc) {
        // Ψάχνουμε για γνωστές διοργανώσεις
        const leagues = [
          'UEFA Nations League', 'UEFA Champions League', 'UEFA Europa League',
          'Premier League', 'Bundesliga', 'Serie A', 'LaLiga', 'Ligue 1',
          'Euroleague', 'NBA', 'ACB', 'Greek Basket League',
          'FIBA Champions League', 'Eredivisie', 'Super League',
          'Nations League', 'Champions League', 'Europa League',
          'World Cup', 'Euro 2024', 'Copa America', 'FA Cup'
        ];
        
        for (let l of leagues) {
          if (desc.includes(l)) {
            league = l;
            break;
          }
        }
        
        // Αν δεν βρήκε, ψάχνουμε στον τίτλο
        if (!league) {
          for (let l of leagues) {
            if (title.includes(l)) {
              league = l;
              break;
            }
          }
        }
      }
      
      // Βρίσκουμε τις ομάδες
      let home = '';
      let away = '';
      let isMatch = false;
      
      // Αν έχει " – " ή " - " ή " vs "
      if (title.includes(' – ') || title.includes(' - ') || title.includes(' vs ')) {
        const parts = title.split(/\s*[–-]\s*|\s*vs\s*/i);
        if (parts.length >= 2) {
          home = parts[0].trim();
          away = parts[parts.length - 1].trim();
          isMatch = true;
        }
      }
      
      // Αν έχει " : " (π.χ. "Ποδόσφαιρο: Κροατία – Πολωνία")
      if (!isMatch && title.includes(':')) {
        const parts = title.split(':');
        if (parts.length >= 2) {
          const rest = parts.slice(1).join(':').trim();
          const teamParts = rest.split(/\s*[–-]\s*|\s*vs\s*/i);
          if (teamParts.length >= 2) {
            home = teamParts[0].trim();
            away = teamParts[teamParts.length - 1].trim();
            isMatch = true;
          }
        }
      }
      
      // Φιλτράρουμε μη-αγώνες
      const nonMatches = ['Στιγμιότυπα', 'Προεπισκόπηση', 'Ανασκόπηση', 'Inside', 'Kick-off', 'Classic Match', 'Special', 'Taste of Europe', 'Shot Clock', 'News', 'Highlights', 'Περίοδος'];
      const isNonMatch = nonMatches.some(word => title.includes(word) || away.includes(word) || home.includes(word));
      
      // Αν είναι αγώνας και έχει ομάδες
      if (isMatch && home && away && home.length > 1 && away.length > 1 && !isNonMatch) {
        // Καθαρισμός
        const cleanHome = home.replace(/^Ποδόσφαιρο[:|]\s*/, '').replace(/^Μπάσκετ[:|]\s*/, '').trim();
        const cleanAway = away.replace(/^Ποδόσφαιρο[:|]\s*/, '').replace(/^Μπάσκετ[:|]\s*/, '').trim();
        
        games.push({
          time: cleanTime || '--:--',
          home: cleanHome.substring(0, 35),
          away: cleanAway.substring(0, 35),
          channel: channel || '—',
          sport: sport || '—',
          league: league || ''
        });
      }
    });

    console.log(`🎯 Βρέθηκαν ${games.length} αγώνες`);

    // Αφαίρεση διπλότυπων
    const seen = new Set();
    const cleanGames = games
      .filter(g => g.time && g.home && g.away && g.home !== g.away)
      .filter(g => {
        const key = `${g.time}-${g.home}-${g.away}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })

    if (cleanGames.length > 0) {
      const data = {
        date: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString(),
        total: cleanGames.length,
        games: cleanGames
      };

      fs.writeFileSync('programma.json', JSON.stringify(data, null, 2));
      console.log('💾 Αποθηκεύτηκαν', cleanGames.length, 'αγώνες με διοργανώσεις');
      
      cleanGames.slice(0, 5).forEach((g, i) => {
        console.log(`  ${i+1}. ${g.time} - ${g.home} vs ${g.away} (${g.league || 'N/A'})`);
      });
    } else {
      console.log('⚠️ ΔΕΝ βρέθηκαν αγώνες!');
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
