const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeProgramma() {
  console.log('🔄 Ξεκινάω το scraping...');
  
  try {
    // 1. Τραβάμε τη σελίδα
    const response = await axios.get('https://programmatv.gr/athlitika/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'el,en-US;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });

    console.log('✅ Σελίδα φορτώθηκε, μέγεθος:', response.data.length);

    const $ = cheerio.load(response.data);
    const games = [];

    // 2. Αφαίρεσε όλα τα σχόλια από το HTML
    $('*').each((i, el) => {
      if (el.type === 'comment') {
        $(el).remove();
      }
    });

    // 3. Ψάχνουμε για παιχνίδια - ΜΕΘΟΔΟΣ 1: Πίνακες με ώρες
    $('table, tbody').each((i, table) => {
      $(table).find('tr').each((j, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const time = $(cells[0]).text().trim();
          const home = $(cells[1]).text().trim();
          const away = $(cells[2]).text().trim();
          
          // Έλεγχος αν είναι ώρα (π.χ. 21:45) και υπάρχουν ομάδες
          if (time.match(/\d{1,2}:\d{2}/) && home.length > 1 && away.length > 1) {
            games.push({ time, home, away });
          }
        }
      });
    });

    // 4. ΜΕΘΟΔΟΣ 2: Ψάχνουμε σε div με κλάσεις
    if (games.length === 0) {
      $('.game, .match, .event, .schedule-item, .program-item').each((i, el) => {
        const time = $(el).find('.time, .hour, .match-time, .event-time').text().trim();
        const home = $(el).find('.home, .team-home, .team1, .home-team').text().trim();
        const away = $(el).find('.away, .team-away, .team2, .away-team').text().trim();
        
        if (time.match(/\d{1,2}:\d{2}/) && home.length > 1 && away.length > 1) {
          games.push({ time, home, away });
        }
      });
    }

    // 5. ΜΕΘΟΔΟΣ 3: Ψάχνουμε με regex σε όλο το HTML
    if (games.length === 0) {
      const html = response.data;
      
      // Pattern 1: Ψάχνει για ώρες μέσα σε spans
      const regex1 = /<span[^>]*>(\d{1,2}:\d{2})<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
      let match;
      while ((match = regex1.exec(html)) !== null) {
        const time = match[1].trim();
        const home = match[2].trim();
        const away = match[3].trim();
        if (time && home && away && home.length > 1 && away.length > 1) {
          games.push({ time, home, away });
        }
      }
    }

    // 6. ΜΕΘΟΔΟΣ 4: Ψάχνουμε για αγώνες που έχουν "vs" ή "-" ή "–"
    if (games.length === 0) {
      const html = response.data;
      const regex2 = /(\d{1,2}:\d{2})\s*(?:vs|VS|–|-)\s*([^\d,]+?)\s*(?:vs|VS|–|-)\s*([^\d<,]+)/g;
      let match2;
      while ((match2 = regex2.exec(html)) !== null) {
        const time = match2[1].trim();
        const home = match2[2].trim();
        const away = match2[3].trim();
        if (time && home && away && home.length > 1 && away.length > 1) {
          games.push({ time, home, away });
        }
      }
    }

    // 7. ΜΕΘΟΔΟΣ 5: Τελευταία λύση - Ψάχνουμε για ώρες και ζευγάρια
    if (games.length === 0) {
      const html = response.data;
      // Βρίσκουμε όλες τις ώρες
      const times = html.match(/\d{1,2}:\d{2}/g) || [];
      // Ψάχνουμε για ζευγάρια ομάδων
      const teamPairs = html.match(/([Α-ΩΆΈΉΊΌΎΏα-ωάέήίόύώ\s]+)\s*(?:vs|VS|–|-)\s*([Α-ΩΆΈΉΊΌΎΏα-ωάέήίόύώ\s]+)/g) || [];
      
      times.forEach((time, index) => {
        if (teamPairs[index]) {
          const parts = teamPairs[index].split(/\s*(?:vs|VS|–|-)\s*/);
          if (parts.length === 2) {
            const home = parts[0].trim();
            const away = parts[1].trim();
            if (home.length > 1 && away.length > 1) {
              games.push({ time, home, away });
            }
          }
        }
      });
    }

    console.log(`🎯 Βρέθηκαν ${games.length} παιχνίδια`);

    // 8. Καθαρισμός και αφαίρεση διπλότυπων
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

    // 9. Αποθήκευση
    const data = {
      date: new Date().toISOString().split('T')[0],
      updated: new Date().toISOString(),
      total: cleanGames.length,
      games: cleanGames
    };

    fs.writeFileSync('programma.json', JSON.stringify(data, null, 2));
    console.log('💾 Αποθηκεύτηκε programma.json με', cleanGames.length, 'παιχνίδια');

    // 10. Εκτύπωση των πρώτων 5 για έλεγχο
    if (cleanGames.length > 0) {
      console.log('📋 Πρώτα 5 παιχνίδια:');
      cleanGames.slice(0, 5).forEach((g, i) => {
        console.log(`  ${i+1}. ${g.time} - ${g.home} vs ${g.away}`);
      });
    } else {
      console.log('⚠️ ΔΕΝ βρέθηκαν παιχνίδια! Μπορεί η δομή της σελίδας να έχει αλλάξει.');
      // Αποθηκεύουμε ένα δείγμα του HTML για debugging
      fs.writeFileSync('debug.html', response.data.substring(0, 5000));
      console.log('💾 Αποθηκεύτηκε debug.html για έλεγχο');
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
