import React from 'react';
import AtletaFormCompleto from './components/AtletaFormCompleto';
import type { Atleta } from './types/Atleta';

function App() {
  const handleSaveAtleta = (atleta: Atleta) => {
    console.log('Atleta guardado', atleta);
    alert('Atleta guardado com sucesso!');
    // Aqui podes integrar com o teu backend via fetch ou axios
    // fetch(import.meta.env.VITE_API_URL + '/atletas', { ... })
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '16px' }}>
      <h1>Registo de Sócio / Atleta</h1>
      <AtletaFormCompleto onSave={handleSaveAtleta} />
    </div>
  );
}

export default App;
