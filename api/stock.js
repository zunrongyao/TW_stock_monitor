export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol' });
  }

  try {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    
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

    // 優先使用即時價，若休市則退回使用最後收盤價
    let currentPrice = meta.regularMarketPrice;
    let previousClose = meta.chartPreviousClose || meta.previousClose;

    // 若 meta 抓不到，從歷史紀錄抓最新一筆收盤價
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

    return res.status(200).json({
      symbol: symbol.toUpperCase(),
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