import { z } from 'zod'

export const AnalysisResultSchema = z.object({
  psychological_reasons: z
    .array(z.string())
    .min(1, 'At least one psychological reason required'),
  environmental_triggers: z
    .array(z.string())
    .min(1, 'At least one environmental trigger required'),
  when_to_worry: z.string().min(1, 'When to worry guidance required'),
})

export const AnalyzeRequestSchema = z.object({
  behaviour: z.string().min(3, 'Behaviour description too short').max(1000),
})

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>
