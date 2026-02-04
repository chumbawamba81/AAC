import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { HelpCircle, ChevronDown } from "lucide-react";
import Accordion from "./ui/accordion";

export default function FAQ({ items = [], allowMultiple = false }) {
  const [openIds, setOpenIds] = useState(new Set());
  const headersRef = useRef([]);

  useEffect(() => {
    // initialize refs array length
    headersRef.current = headersRef.current.slice(0, items.length);
  }, [items.length]);

  function toggle(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  }

  function isOpen(id) {
    return openIds.has(id);
  }

  // keyboard navigation for accordion headers
  function onHeaderKeyDown(e, index) {
    const max = items.length - 1;
    let nextIndex;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        nextIndex = index === max ? 0 : index + 1;
        headersRef.current[nextIndex]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        nextIndex = index === 0 ? max : index - 1;
        headersRef.current[nextIndex]?.focus();
        break;
      case "Home":
        e.preventDefault();
        headersRef.current[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        headersRef.current[max]?.focus();
        break;
      case "Enter":
      case " ": // Space
        e.preventDefault();
        toggle(items[index].id);
        break;
      default:
        break;
    }
  }

  //
  const faqItems = [
    {
      id: "one",
      title: "Como funcionam as modalidades de associado da AAC-SB?",
      content: () => (
        <div>
          
          <table className="min-w-full">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold">
                  Perfis de Associados Seccionistas:
                </th>
                <th className="px-4 py-2 font-semibold">Quotas</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-4 py-2"><p className="font-bold">Atleta da SB.AAC</p> - Atleta da secção de basquetebol.</td>
                <td className="px-4 py-2">Isento</td>
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2"><p className="font-bold">Sócio PRO</p> - Encarregado de educação (EE) de atleta(s) da secção (Desconto nas mensalidades).</td>
                <td className="px-4 py-2">60 €</td>
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2"><p className="font-bold">Sócio Família</p> - Associado, em que já existe um elemento do agregado familiar do sócio PRO ou Geral.</td>
                <td className="px-4 py-2">30 €</td>
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2"><p className="font-bold">Sócio Geral</p> - Associado seccionista, sem familiar atleta(s) da secção.</td>
                <td className="px-4 py-2">100 € / 75 €</td>
              </tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "two",
      title: "Qual o valor de inscrição dos atletas?",
      content: () => (
        <div>
          O perfil de associado do Encarregado de Educação (EE) tem um papel importante no valor de inscrição.
          <br />
          <ul className="list-disc list-inside ml-4">
            <li>EE sócio PRO - o atleta tem desconto na taxa de inscrição e nas mensalidades.</li>
            <li>Existem valores diferentes para os atletas de diferentes idades.</li>
            <li>Os pagamentos podem ser feitos de forma anual, trimestral ou mensal, dependendo do plano escolhido.</li>
            <li>A imagem abaixo mostra os preços de 2025.</li>
          </ul>
          <br />
          
          <img
            src="/precos/pagamentos-2025.png"
            alt="Precos de 2025"
            className="w-full h-auto"
          />
        </div>
      ),
      content2: "Depende. ",
    },
    {
      id: "three",
      title: "Quais são os documentos necessários para inscrever um atleta?",
      content: () => (
        <div>
          <p className="font-bold">São necessários os seguintes documentos:</p>
          <ul className="list-disc list-inside ml-4">
            <li>Ficha de sócio de atleta</li>
            <li>Ficha de jogador FPB</li>
            <li>Termo de responsabilidade</li>
            <li>Exame médico</li>
          </ul>
          <br />
          Pode descarregar os modelos na secção "Documentos".
        </div>
      ),
    },
    {
      id: "four",
      title: "Como funcionam os pagamentos?",
      content:
        'Os pagamentos podem ser feitos de forma anual, trimestral ou mensal, dependendo do plano escolhido. Após a inscrição de um atleta, será gerado um QR Code para pagamento. Pode consultar todos os pagamentos na secção "Tesouraria".',
    },
    {
      id: "five",
      title: "Preciso de ser sócio para inscrever um atleta?",
      content:
        'Não é obrigatório ser sócio para inscrever um atleta. Pode escolher "Não pretendo ser sócio" ao preencher os seus dados pessoais.',
    },
    {
      id: "six",
      title: "Como contacto a secção de basquetebol?",
      content:
        "Pode contactar através do email basquetebol.secretaria@academica.pt ou através das redes sociais (Facebook e Instagram) cujos links estão disponíveis no rodapé da página.",
    },
    {
      id: "seven",
      title: "O que fazer se tiver problemas técnicos?",
      content:
        "Se encontrar algum problema técnico, por favor contacte-nos através do email basquetebol.secretaria@academica.pt com uma descrição detalhada do problema.",
    },
    {
      id: 'eight',
      title: 'Como comprar equipamentos?',
      content: () => (
        <div>
          Para encomendar equipamentos desportivos da secção de basquetebol,
          preencha o formulário oficial. Após submissão, será enviada uma cópia
          para o seu e-mail.
          <br />
          Os pedidos são compilados e enviados para a Dhika de duas em duas semanas. A entrega demora no minimo 5 semanas.
          <br />
          <br />
          <a
            href="https://forms.gle/8Uaudn8JW4CJCwde7"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline font-medium hover:no-underline"
          >
            Abrir formulário de encomenda de equipamentos →
          </a>
        </div>
      ),
    },
  ];

  // Example usage:
  //
  // const items = [
  //   { id: 'one', title: 'What is Tailwind?', content: 'Tailwind is a utility-first CSS framework.' },
  //   { id: 'two', title: 'Why React?', content: () => (<div>React is component-based and declarative.</div>) },
  // ];
  //
  // <Accordion items={items} allowMultiple={false} />

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Perguntas Frequentes (FAQ)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion items={faqItems} allowMultiple={false} />
        </CardContent>
      </Card>
    </div>
  );
}
