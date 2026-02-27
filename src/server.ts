import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'


dotenv.config()

const app = express()
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
)
app.options('{*splat}', cors())
app.use(express.json())

const gemini = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || '',
})

app.post('/api/analyze', async (req, res) => {
  try {
    const { behavior } = req.body

    if (!behavior) {
      return res.status(400).json({ error: 'Behavior is required' })
    }

const completion = await gemini.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: {
    parts: [
      {
        text: `You are a professional dog behaviorist. Explain why dogs might show the described behavior. Give: 1. Possible psychological reasons 2. Environmental triggers 3. When the owner should worry. Keep it clear and friendly.\n\nBehavior: ${behavior}`,
      },
    ],
  },
})

res.json({
  result: completion.candidates?.[0]?.content?.parts?.[0]?.text || 'No response',
})
  } catch (error) {
    console.error(error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'An error occurred',
    })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
