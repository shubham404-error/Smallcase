const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. Yahoo Finance Proxy Endpoint
app.get('/api/finance/:ticker', async (req, res) => {
    const { ticker } = req.params;
    try {
        const proxyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        const response = await axios.get(proxyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        const meta = response.data?.chart?.result?.[0]?.meta;
        if (meta && meta.regularMarketPrice) {
            const price = meta.regularMarketPrice;
            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const changePercent = (((price - prevClose) / prevClose) * 100).toFixed(2);
            
            res.json({ price, changePercent });
        } else {
            res.status(404).json({ error: 'Market data not found' });
        }
    } catch (error) {
        console.error(`Error fetching Yahoo Finance data for ${ticker}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch financial data' });
    }
});

// 2. Gemini AI Chat Endpoint
app.post('/api/chat', async (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    try {
        // Use gemini-3.5-flash model
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-3.5-flash',
            systemInstruction: "Act as a world-class portfolio manager and smallcase investment analyst for Capitalsense Advisors India Emergent Industries Basket. Provide rigorous, precise, and professional explanations of our pure-play basket thesis, valuation metrics, exclusions (Hitachi, Motherson, Bharat Forge, Waaree), and macro sleeves (Data Centers, Aerospace, Solar, Electronics). Keep responses concise and focused on smallcase investors."
        });

        let result;
        let retries = 0;
        const maxRetries = 3;
        let delay = 1000; // 1 second initial delay

        while (retries < maxRetries) {
            try {
                result = await model.generateContent(prompt);
                break; // Success, break out of retry loop
            } catch (err) {
                // If it's a 503 error, wait and retry
                if (err.message.includes('503') && retries < maxRetries - 1) {
                    console.warn(`503 Service Unavailable. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries++;
                    delay *= 2; // Exponential backoff (1s, 2s)
                } else {
                    throw err; // Re-throw if it's a different error or max retries reached
                }
            }
        }

        const responseText = result.response.text();
        
        res.json({ response: responseText });
    } catch (error) {
        console.error('Error with Gemini API:', error.message);
        res.status(500).json({ error: 'Failed to generate AI response' });
    }
});

// 3. Benchmark Data Endpoint
app.get('/api/benchmark', async (req, res) => {
    try {
        const symbols = ['^CRSLDX', 'TARIL.NS', 'ANANTRAJ.NS', 'CUMMINSIND.NS', 'BHARTIARTL.NS', 'DYNAMATECH.NS', 'AZAD.NS', 'BELRISE.NS', 'EMMVEE.NS', 'PREMIERENE.NS', 'KAYNES.NS'].join(',');
        const proxyUrl = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols}&range=3y&interval=1mo`;
        const response = await axios.get(proxyUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching benchmark data:', error.message);
        res.status(500).json({ error: 'Failed to fetch benchmark data' });
    }
});

// Catch-all route to serve the HTML app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
