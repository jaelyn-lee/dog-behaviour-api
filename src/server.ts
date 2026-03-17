import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
})

import analysesRouter from './routes/analyses'

const app = express()

app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.options('{*splat}', cors())
app.use(express.json())

// Routes
app.use('/api/analyses', analysesRouter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

Sentry.setupExpressErrorHandler(app)

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  },
)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
