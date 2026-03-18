import { Router, Response, Request } from 'express'
import { GoogleGenAI, Type } from '@google/genai'
import { supabase } from '../lib/supabase'
import { AnalysisResultSchema, AnalyzeRequestSchema } from '../lib/schemas'
import { AuthRequest, requireAuth } from '../middleware/auth'
import { treeifyError } from 'zod'

const router = Router()

const gemini = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || '',
})

const jsonSchema = {
  type: Type.OBJECT,
  properties: {
    psychological_reasons: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Possible psychological reasons for the behavior.',
    },
    environmental_triggers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Environmental triggers that might cause the behavior.',
    },
    when_to_worry: {
      type: Type.STRING,
      description: 'Guidance on when the owner should be concerned.',
    },
  },
  required: [
    'psychological_reasons',
    'environmental_triggers',
    'when_to_worry',
  ],
}

const breedScanResponseSchema = {
  type: Type.OBJECT,
  properties: {
    found: { type: Type.BOOLEAN },
    message: { type: Type.STRING },
    breed: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    origin: { type: Type.STRING },
    temperament: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    size: { type: Type.STRING },
    lifespan: { type: Type.STRING },
    fun_fact: { type: Type.STRING },
    energy: { type: Type.NUMBER },
    friendliness: { type: Type.NUMBER },
    trainability: { type: Type.NUMBER },
  },
  required: ['found'],
}

// POST (/api/analyses)
// Description: Analyze a dog behaviour using AI and save the result
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = AnalyzeRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request',
      details: treeifyError(parsed.error),
    })
  }

  const { behaviour } = parsed.data

  const completion = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    config: {
      responseMimeType: 'application/json',
      responseSchema: jsonSchema,
    },
    contents: {
      parts: [
        {
          text: `You are a professional dog behaviourist. Explain why dogs might show the described behaviour. Give: 1. Possible psychological reasons 2. Environmental triggers 3. When the owner should worry. Keep it clear and friendly.\n\nBehaviour: ${behaviour}`,
        },
      ],
    },
  })

  const rawText = completion.candidates?.[0]?.content?.parts?.[0]?.text

  if (!rawText) {
    return res.status(502).json({ error: 'No response from AI model' })
  }

  const aiResult = AnalysisResultSchema.safeParse(JSON.parse(rawText))
  if (!aiResult.success) {
    return res.status(502).json({
      error: 'AI response did not match expected structure',
      details: treeifyError(aiResult.error),
    })
  }

  const { data, error: dbError } = await supabase
    .from('analyses')
    .insert({
      user_id: req.userId,
      behaviour_input: behaviour,
      ...aiResult.data,
    })
    .select()
    .single()

  if (dbError) {
    console.error('DB insert error:', dbError)
    return res.status(500).json({ error: 'Failed to save analysis' })
  }

  res.status(201).json({ result: data })
})

// GET (/api/analyses)
// Description: Get a list of analyses
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch analyses' })
  }

  res.json({ analyses: data })
})

// GET (/api/analyses/:id)
//Description: Get an analysis by ID
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Analysis not found' })
  }

  res.json({ analysis: data })
})

// POST (/api/analyses/guest)
// Description: Analyze a dog behaviour using AI without saving for guest users
router.post('/guest', async (req: Request, res: Response) => {
  const parsed = AnalyzeRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request',
      details: treeifyError(parsed.error),
    })
  }

  const { behaviour } = parsed.data

  const completion = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    config: {
      responseMimeType: 'application/json',
      responseSchema: jsonSchema,
    },
    contents: {
      parts: [
        {
          text: `You are a professional dog behaviourist. Explain why dogs might show the described behaviour. Give: 1. Possible psychological reasons 2. Environmental triggers 3. When the owner should worry. Keep it clear and friendly.\n\nBehaviour: ${behaviour}`,
        },
      ],
    },
  })

  const rawText = completion.candidates?.[0]?.content?.parts?.[0]?.text

  if (!rawText) {
    return res.status(502).json({ error: 'No response from AI model' })
  }

  const aiResult = AnalysisResultSchema.safeParse(JSON.parse(rawText))
  if (!aiResult.success) {
    return res.status(502).json({ error: 'Unexpected AI response structure' })
  }

  res.status(200).json({ result: aiResult.data })
})

// POST (/api/analyses/breed-scan)
// Description: Analyze a dog breed based on an image using AI
router.post('/breed-scan', async (req: Request, res: Response) => {
  const { imageBase64 } = req.body

  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing image data' })
  }

  const mimeTypeMatch = imageBase64.match(/^data:(image\/\w+);base64,/)
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg'
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '')

  try {
    const result = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      // config: {
      //   responseMimeType: 'application/json',
      //   responseJsonSchema: breedScanResponseSchema,
      // },
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `You are an expert dog breed identifier. Analyse this image carefully.

If there is a dog in the image, respond ONLY with a JSON object (no markdown, no explanation) like this:
{
  "found": true,
  "breed": "Golden Retriever",
  "confidence": 92,
  "origin": "Scotland, UK",
  "temperament": ["Kind", "Intelligent", "Reliable"],
  "size": "Large",
  "lifespan": "10-12 years",
  "fun_fact": "Golden Retrievers love water and are excellent swimmers!",
  "energy": 85,
  "friendliness": 98,
  "trainability": 90
}

If no dog is found, respond ONLY with:
{ "found": false, "message": "No dog found! Please show the dog to the camera! 🐾" }

Be precise with breeds. Mixed breeds are okay to identify too.`,
          },
        ],
      },
    })

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) {
      return res.status(502).json({ error: 'No response from AI model' })
    }
    const clean = rawText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()
    res.json({ result: JSON.parse(clean) })
  } catch (error) {
    console.error('Error during breed scan:', error)
    return res.status(500).json({ error: 'Failed to analyze breed' })
  }
})

export default router
