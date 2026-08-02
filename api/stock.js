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

    // Friendly display name
    let displayName = symbol.toUpperCase();
    if (symbol === '^TWII') displayName = '加權指數';
    if (symbol === 'FITX.TWO' || symbol.toUpperCase() === 'WTXP&') displayName = '臺指期';

    return res.status(200).json({
      symbol: displayName,
      price: priceStr,
      previousClose: prevStr,
      change: changeStr,
      changePercent: changePercentStr
    });

  } catch (error) {
    console.error(`API Error for ${symbol}:`, error);
    return res.status(500).json({ error: 'Failed to fetch stock data' });
  }
}