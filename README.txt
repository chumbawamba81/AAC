# AtletaFormCompleto — Instruções de integração

1) Copiar as pastas `src/components`, `src/utils` e `src/types` para o teu projeto (fundem com as existentes se já houver).

2) No teu `src/App.tsx`, importa e usa o componente:

```tsx
import AtletaFormCompleto from './components/AtletaFormCompleto';
import type { Atleta } from './types/Atleta';

export default function App(){
  const handleSave = (a: Atleta) => {
    console.log('Atleta guardado', a);
    alert('Atleta guardado!');
  };
  return (
    <div style={{maxWidth: 900, margin: '0 auto', padding: 16}}>
      <h1>Inscrição de Atleta</h1>
      <AtletaFormCompleto onSave={handleSave} />
    </div>
  );
}
```

3) O cálculo de **Escalão** é automático a partir da data de nascimento e do género.
4) Validações incluídas: NIF 🇵🇹, código‑postal (####-###), emails preferenciais (separados por `;`).

Qualquer dúvida na integração, diz-me e eu ajusto diretamente no teu `App.tsx` atual.
