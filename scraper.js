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
      timeout: 10000 // 10 δευτερόλεπτα timeout
    });

    console.log('✅ Σελίδα φορτώθηκε, μέγεθος:', response.data.length, 'χαρακτήρες');

    const $ = cheerio.load(response.data);
    const games = [];

    // 2. Βρίσκουμε τα παιχνίδια - Δοκιμάζουμε διάφορα patterns
    let found = 0;

    // Pattern 1: Κλασικό πρόγραμμα
    $('.game-item, .match-item, .schedule-item').each((i, el) => {
      const time = $(el).find('.time, .hour, .match-time').text().trim();
      const home = $(el).find('.team-home, .home-team, .team1').text().trim();
      const away = $(el).find('.team-away, .away-team, .team2').text().trim();
      const channel = $(el).find('.channel, .tv-channel').text().trim();
      
      if (time && home && away && home.length > 0 && away.length > 0) {
        games.push({ time, home, away, channel });
        found++;
      }
    });

    // Pattern 2: Αν δεν βρήκε, ψάχνουμε σε πίνακες
    if (games.length === 0) {
      $('tr').each((i, el) => {
        const cells = $(el).find('td');
        if (cells.length >= 3) {
          const time = $(cells[0]).text().trim();
          const home = $(cells[1]).text().trim();
          const away = $(cells[2]).text().trim();
          if (time && home && away && home.length > 1 && away.length > 1) {
            games.push({ time, home, away, channel: '' });
            found++;
          }
        }
      });
    }

    // Pattern 3: Ψάχνουμε με regex σε όλο το HTML
    if (games.length === 0) {
      const html = response.data;
      const regex = /<span[^>]*class="[^"]*time[^"]*"[^>]*>([^<]+)<\/span>.*?<span[^>]*class="[^"]*team[^"]*"[^>]*>([^<]+)<\/span>.*?<span[^>]*class="[^"]*team[^"]*"[^>]*>([^<]+)<\/span>/gs;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const time = match[1].trim();
        const home = match[2].trim();
        const away = match[3].trim();
        if (time && home && away) {
          games.push({ time, home, away, channel: '' });
          found++;
        }
      }
    }

    console.log(`🎯 Βρέθηκαν ${games.length} παιχνίδια`);

    // 3. Περιορίζουμε σε 20 παιχνίδια και καθαρίζουμε
    const cleanGames = games
      .filter(g => g.home && g.away && g.home !== '-' && g.away !== '-')
      .slice(0, 20)
      .map(g => ({
        time: g.time || '--:--',
        home: g.home.substring(0, 30),
        away: g.away.substring(0, 30),
        channel: g.channel || '—'
      }));

    // 4. Φτιάχνουμε το JSON
    const data = {
      date: new Date().toISOString().split('T')[0],
      updated: new Date().toISOString(),
      total: cleanGames.length,
      games: cleanGames
    };

    // 5. Αποθηκεύουμε το αρχείο
    fs.writeFileSync('programma.json', JSON.stringify(data, null, 2));
    console.log('💾 Αποθηκεύτηκε programma.json με', cleanGames.length, 'παιχνίδια');

    // 6. Αποθηκεύουμε και ένα απλό version για εύκολη ανάγνωση
    const simpleData = cleanGames.map(g => `${g.time} - ${g.home} vs ${g.away}`).join('\n');
    fs.writeFileSync('programma.txt', simpleData);
    console.log('💾 Αποθηκεύτηκε programma.txt');

  } catch (error) {
    console.error('❌ ΣΦΑΛΜΑ:', error.message);
    if (error.response) {
      console.error('📡 HTTP Status:', error.response.status);
    }
    // Βγάζουμε error αλλά δεν σταματάμε το workflow
    process.exit(1);
  }
}

// Τρέχουμε το scraper
scrapeProgramma();
