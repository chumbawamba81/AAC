import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

// Accessible Accordion component using Tailwind CSS
// - Default export is <Accordion items={items} allowMultiple={false} />
// - items: [{ id, title, content }]
// - allowMultiple: if true, more than one panel can be open

export default function Accordion({ items = [], allowMultiple = false }) {
  const [openIds, setOpenIds] = useState(
    () => new Set(items.length ? [items[0].id] : [])
  );
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

  return (
    <>
      {items.map((item, idx) => {
        const open = isOpen(item.id);
        const panelId = `accordion-panel-${item.id}`;
        const headerId = `accordion-header-${item.id}`;

        return (
          <div key={item.id} className="mb-1">
            <h3 className="text-md font-medium bg-stone-200">
              <button
                id={headerId}
                ref={(el) => (headersRef.current[idx] = el)}
                aria-controls={panelId}
                aria-expanded={open}
                onClick={() => toggle(item.id)}
                onKeyDown={(e) => onHeaderKeyDown(e, idx)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 transition-all`}
              >
                <span className="font-medium">{item.title}</span>
                <ChevronDown
                  className={`transition-transform duration-200 ${
                    open ? "rotate-180" : "rotate-0"
                  }`}
                  aria-hidden="true"
                />
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              hidden={!open}
              className={`px-4 pb-4 text-sm leading-6 prose max-w-none ${
                open ? "block" : "hidden"
              }`}
            >
              {typeof item.content === "function"
                ? item.content()
                : item.content}
            </div>
          </div>
        );
      })}
    </>
  );
}

// Example usage:
//
// const items = [
//   { id: 'one', title: 'What is Tailwind?', content: 'Tailwind is a utility-first CSS framework.' },
//   { id: 'two', title: 'Why React?', content: () => (<div>React is component-based and declarative.</div>) },
// ];
//
// <Accordion items={items} allowMultiple={false} />
