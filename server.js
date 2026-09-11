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
        // Use standard gemini-1.5-flash for speed and lower cost
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            systemInstruction: "Act as a world-class portfolio manager and smallcase investment analyst for Capitalsense Advisors India Emergent Industries Basket. Provide rigorous, precise, and professional explanations of our pure-play basket thesis, valuation metrics, exclusions (Hitachi, Motherson, Bharat Forge, Waaree), and macro sleeves (Data Centers, Aerospace, Solar, Electronics). Keep responses concise and focused on smallcase investors."
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        res.json({ response: responseText });
    } catch (error) {
        console.error('Error with Gemini API:', error.message);
        res.status(500).json({ error: 'Failed to generate AI response' });
    }
});

// Catch-all route to serve the HTML app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
