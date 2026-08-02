// Stock name lookup helper function
async function getStockChineseName(symbol, meta) {
  if (symbol === '^TWII') return '加權指數';
  if (symbol === 'FITX.TWO' || symbol.toUpperCase() === 'WTXP&') return '臺指期';

  const codeMatch = symbol.match(/^(\d{4,5})/);
  const code = codeMatch ? codeMatch[1] : null;

  if (code) {
    // Attempt TWSE MIS real-time API first
    try {
      const prefix = symbol.endsWith('.TWO') ? 'otc' : 'tse';
      const twseUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${prefix}_${code}.tw`;
      const res = await fetch(twseUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (res.ok) {
        const twseData = await res.json();
        if (twseData.msgArray && twseData.msgArray[0] && twseData.msgArray[0].n) {
          return twseData.msgArray[0].n;
        }
      }
    } catch (e) {
      console.warn('TWSE name lookup failed, using fallback:', e);
    }
  }

  // Fallback to Yahoo meta if available and non-English/valid, or symbol
  return meta?.shortName || meta?.longName || symbol;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  let { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol' });
  }

  // Map WTXP& or WTX to Yahoo Finance Taiwan Futures symbol if needed
  if (symbol.toUpperCase() === 'WTXP&' || symbol.toUpperCase() === 'WTX') {
    symbol = 'FITX.TWO'; // Taiwan Index Futures ticker on Yahoo Finance
  }

  try {
    const encodedSymbol = encodeURIComponent(symbol);
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1m&range=1d`;
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo API status: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result[0];
    const meta = result.meta;

    let currentPrice = meta.regularMarketPrice;
    let previousClose = meta.chartPreviousClose || meta.previousClose;

    // Fallback if market is closed
    if (!currentPrice && result.indicators && result.indicators.quote[0].close) {
      const closes = result.indicators.quote[0].close.filter(p => p !== null);
      if (closes.length > 0) {
        currentPrice = closes[closes.length - 1];
        previousClose = closes[closes.length - 2] || currentPrice;
      }
    }

    const priceStr = currentPrice ? currentPrice.toFixed(2) : '--';
    const prevStr = previousClose ? previousClose.toFixed(2) : '--';
    
    let changeStr = '--';
    let changePercentStr = '--';

    if (currentPrice && previousClose) {
      const diff = currentPrice - previousClose;
      changeStr = diff.toFixed(2);
      changePercentStr = ((diff / previousClose) * 100).toFixed(2);
    }

    // Friendly display symbol & Chinese Name
    let displayName = symbol.toUpperCase();
    if (symbol === '^TWII') displayName = '加權指數';
    else if (symbol === 'FITX.TWO' || symbol.toUpperCase() === 'WTXP&') displayName = '臺指期';

    const stockName = await getStockChineseName(symbol, meta);

    // Extract intraday series (prices & timestamps)
    let chartData = [];
    if (result.timestamp && result.indicators && result.indicators.quote[0]) {
      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0].close || [];
      const high = meta.regularMarketDayHigh || Math.max(...quotes.filter(Boolean));
      const low = meta.regularMarketDayLow || Math.min(...quotes.filter(Boolean));
      const open = meta.regularMarketOpen || quotes.find(Boolean);

      chartData = timestamps.map((t, idx) => ({
        time: new Date(t * 1000).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }),
        price: quotes[idx] !== null && quotes[idx] !== undefined ? parseFloat(quotes[idx].toFixed(2)) : null
      })).filter(item => item.price !== null);
    }

    return res.status(200).json({
      symbol: displayName,
      rawSymbol: symbol,
      name: stockName,
      price: priceStr,
      previousClose: prevStr,
      change: changeStr,
      changePercent: changePercentStr,
      chart: chartData
    });

  } catch (error) {
    console.error(`API Error for ${symbol}:`, error);
    return res.status(500).json({ error: 'Failed to fetch stock data' });
  }
}