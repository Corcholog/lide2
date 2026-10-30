import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button, buttonClass } from '@/components/ui/Button'

/*
 * The button recipe is the one place where the accent fill, the label and the
 * disabled state are defined. What is guarded here is the two things that are
 * easy to break: that the recipe reaches the markup, and that a caller's class
 * wins over the recipe instead of fighting it.
 */

describe('the button recipe', () => {
  it('renders the accent fill and the label', () => {
    const html = renderToStaticMarkup(<Button>Guardar</Button>)

    expect(html).toContain('bg-accent-strong')
    expect(html).toContain('text-on-accent')
    expect(html).toContain('font-medium')
    expect(html).toContain('Guardar')
  })

  it('keeps the shouted label apart from the normal one', () => {
    const html = renderToStaticMarkup(<Button variant="upper">Reintentar</Button>)

    expect(html).toContain('uppercase')
    expect(html).toContain('tracking-wide')
    expect(html).not.toContain('font-medium')
  })

  it('does not set a type, so a button inside a form keeps submitting', () => {
    const html = renderToStaticMarkup(<Button>Guardar</Button>)

    expect(html).not.toContain('type=')
  })

  it('keeps the disabled state in the recipe and not in each caller', () => {
    const classes = buttonClass()

    expect(classes).toContain('disabled:cursor-not-allowed')
    expect(classes).toContain('disabled:opacity-60')
  })

  it('lets a caller override the size without fighting the variant', () => {
    // `tailwind-merge`: the caller's text-xs wins over the size's text-sm.
    const classes = buttonClass({ size: 'md', className: 'text-xs' })

    expect(classes).toContain('text-xs')
    expect(classes).not.toContain('text-sm')
  })
})
