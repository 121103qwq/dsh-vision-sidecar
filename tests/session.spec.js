import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import {
  describedAttachmentIds,
  DESCRIPTION_SOURCE,
  formatDescription,
} from '../src/content.js'

describe('DSH session integration', () => {
  it('accepts and reconstructs a durable vision notice through the rc.6 surface', () => {
    const session = Session.create('vision-session')
    const ref = {
      attachmentId: 'sha256:durable',
      mediaType: 'image/png',
      bytes: 3,
      width: 1,
      height: 1,
    }
    const message = createUserMessage({
      source: DESCRIPTION_SOURCE,
      content: [{ type: 'text', text: formatDescription([ref], 'A blue dialog.', 'test-vlm') }],
    })
    session.append('user/message', message, { surfaceOp: 'append' })

    expect(session.deriveMessages()).toEqual([message])
    const restored = Session.create(session.id, session.events)
    expect(restored.deriveMessages()[0].content[0].text).toContain('A blue dialog.')
    expect(describedAttachmentIds(restored.deriveMessages())).toEqual(new Set(['sha256:durable']))
  })
})
