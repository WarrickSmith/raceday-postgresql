import { render, screen } from '@testing-library/react'
import Home from '../page'

describe('Home Page', () => {
  it('renders without crashing', () => {
    render(<Home />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('contains Next.js logo', () => {
    render(<Home />)
    const logo = screen.getByAltText('Next.js logo')
    expect(logo).toBeInTheDocument()
  })

  it('contains getting started text', () => {
    render(<Home />)
    expect(screen.getByText(/Get started by editing/)).toBeInTheDocument()
    expect(screen.getByText('src/app/page.tsx')).toBeInTheDocument()
  })

  it('contains deploy button', () => {
    render(<Home />)
    expect(screen.getByText('Deploy now')).toBeInTheDocument()
  })

  it('contains docs link', () => {
    render(<Home />)
    expect(screen.getByText('Read our docs')).toBeInTheDocument()
  })
})
