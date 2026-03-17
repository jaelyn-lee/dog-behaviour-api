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

export default router
