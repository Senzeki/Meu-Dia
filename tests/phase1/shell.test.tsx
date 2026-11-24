import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '@/App';

describe('Casca navegável do Meu Dia (Mobile + Split View + Linguagem Natural)', () => {
  it('renderiza as 5 áreas sem jargões artificiais e alterna abas corretamente', async () => {
    const { container } = render(<App />);

    expect(screen.getAllByText('Conversa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Agenda').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Casa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cuidados').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Guardados').length).toBeGreaterThan(0);

    // Verifica ausência de jargões proibidos pelo Plano Mestre
    const textContent = container.textContent?.toLowerCase() ?? '';
    expect(textContent).not.toContain('sem cobrança');
    expect(textContent).not.toContain('radar');
    expect(textContent).not.toContain('descarrego');

    // Navega para Cuidados e expande um ativo (divulgação progressiva)
    const cuidadosTabs = screen.getAllByRole('tab', { name: /cuidados/i });
    fireEvent.click(cuidadosTabs[0]);
    expect(
      await screen.findByText('Minha Moto', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
