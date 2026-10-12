import React from 'react';

/**
 * Componente unificado de Paginación para CONTROL MÉDICA
 * Soporta resumen extra (ej. estadísticas de roles de usuario, estadísticas de categorías).
 */
const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 50,
  onPageChange,
  itemLabel = 'registros',
  className = '',
  disabled = false,
  extraContent = null
}) => {
  if (totalItems === 0 && totalPages <= 1) {
    return (
      <div className={`shrink-0 bg-white border-t border-slate-200/80 px-4 py-1.5 flex justify-between items-center z-10 sticky bottom-0 ${className}`}>
        <div className="text-[11px] text-slate-400 font-medium select-none">
          Sin {itemLabel} para mostrar
        </div>
        {extraContent && (
          <div className="flex items-center gap-2.5 text-[11px] font-medium text-slate-500">
            {extraContent}
          </div>
        )}
      </div>
    );
  }

  const startRecord = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endRecord = Math.min(currentPage * pageSize, totalItems);

  // Formato con punto de miles estricto (ej. 12.299)
  const formatNum = (num) => (num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  // Algoritmo secuencial de 5 páginas continuas + '...'
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    let start = Math.max(1, currentPage - 2);
    let end = start + maxVisible - 1;

    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages) {
      pages.push('ellipsis');
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className={`shrink-0 bg-white/95 backdrop-blur-xs border-t border-slate-200/80 px-4 py-1 flex flex-col sm:flex-row justify-between items-center gap-2 z-10 sticky bottom-0 font-sans ${className}`}>
      {/* Texto Descriptivo + Resumen Extra a la Izquierda */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <div className="text-[11px] text-slate-500 font-normal select-none">
          Mostrando <span className="font-bold text-slate-700">{formatNum(startRecord)} - {formatNum(endRecord)}</span> de <span className="font-bold text-slate-700">{formatNum(totalItems)}</span> {itemLabel}
        </div>
        {extraContent && (
          <div className="flex items-center gap-2.5 text-[11px] font-medium text-slate-500 border-l border-slate-200 pl-3">
            {extraContent}
          </div>
        )}
      </div>

      {/* Controles de Navegación a la Derecha */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange && onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1 || disabled}
          className="px-2.5 py-0.5 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-600 font-normal rounded-lg text-[11px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed select-none shadow-2xs"
        >
          Anterior
        </button>

        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === 'ellipsis') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 text-[11px] font-semibold select-none">
                  ...
                </span>
              );
            }

            const isActive = currentPage === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange && onPageChange(p)}
                disabled={disabled}
                className={`w-6 h-6 rounded-lg text-[11px] font-bold transition-all select-none flex items-center justify-center ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange && onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages || disabled}
          className="px-2.5 py-0.5 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-600 font-normal rounded-lg text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none shadow-2xs"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default Pagination;
