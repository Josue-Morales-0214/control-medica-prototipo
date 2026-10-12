import React from 'react';
import { X, FileSpreadsheet, Calendar, User, Building2, FileText, CheckCircle2, ArrowUpRight, ArrowDownRight, ClipboardCheck } from 'lucide-react';
import ExcelJS from 'exceljs';
import Swal from 'sweetalert2';

const ConciliacionDetailModal = ({ isOpen, onClose, conciliacionData }) => {
  if (!isOpen || !conciliacionData) return null;

  const {
    id,
    fecha_imputada,
    fecha_registro_str,
    hora_registro_str,
    justificacion,
    area,
    usuario,
    usuario_id,
    total_insumos,
    total_aumentos,
    total_faltantes,
    detalle_insumos = []
  } = conciliacionData;

  // Función para exportar el Acta de Conciliación a Excel profesional
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Control Médica - Sistema de Gestión';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Acta de Conciliación', {
        pageSetup: { paperSize: 9, orientation: 'portrait' }
      });

      // Estilos Generales
      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { ARGB: 'FF0F172A' } }; // Slate-900
      const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { ARGB: 'FFF1F5F9' } }; // Slate-100
      const tableHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { ARGB: 'FF1E293B' } }; // Slate-800
      
      // Ancho de columnas
      sheet.columns = [
        { key: 'codigo', width: 14 },
        { key: 'nombre', width: 38 },
        { key: 'categoria', width: 22 },
        { key: 'stock_anterior', width: 16 },
        { key: 'stock_nuevo', width: 16 },
        { key: 'diferencia', width: 16 },
      ];

      // Título Principal
      sheet.mergeCells('A1:F1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'ACTA OFICIAL DE TOMA FÍSICA Y CONCILIACIÓN DE INVENTARIO';
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { ARGB: 'FFFFFFFF' } };
      titleCell.fill = headerFill;
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 32;

      // Subtítulo
      sheet.mergeCells('A2:F2');
      const subTitleCell = sheet.getCell('A2');
      subTitleCell.value = `Unidad Hospitalaria / Servicio: ${area || 'Emergencia'} | ID Acta: #${id || 'N/A'}`;
      subTitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { ARGB: 'FF475569' } };
      subTitleCell.fill = subHeaderFill;
      subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(2).height = 20;

      sheet.addRow([]); // Fila vacía

      // Parámetros y Metadatos de la Conciliación
      const metaRows = [
        ['Fecha de Imputación Histórica:', fecha_imputada || 'N/A', '', 'Responsable:', usuario || 'N/A'],
        ['Fecha Real de Registro:', `${fecha_registro_str || ''} ${hora_registro_str || ''}`.trim(), '', 'Usuario ID:', usuario_id || 'N/A'],
        ['Área / Servicio:', area || 'Emergencia', '', 'Total Insumos Ajustados:', `${total_insumos || detalle_insumos.length} ítem(s)`],
        ['Justificación Obligatoria:', justificacion || 'Sin justificación registrada', '', '', '']
      ];

      metaRows.forEach((rowVals) => {
        const r = sheet.addRow([rowVals[0], rowVals[1], rowVals[2], rowVals[3], rowVals[4]]);
        r.getCell(1).font = { bold: true, size: 10, color: { ARGB: 'FF334155' } };
        r.getCell(2).font = { size: 10, color: { ARGB: 'FF0F172A' } };
        r.getCell(4).font = { bold: true, size: 10, color: { ARGB: 'FF334155' } };
        r.getCell(5).font = { size: 10, color: { ARGB: 'FF0F172A' } };
      });

      sheet.addRow([]); // Fila vacía

      // Encabezados de la Tabla de Insumos
      const tHeader = sheet.addRow(['Código', 'Insumo Médico / Medicamento', 'Categoría', 'Stock Sistema', 'Stock Físico Real', 'Diferencia']);
      tHeader.height = 24;
      tHeader.eachCell((cell) => {
        cell.fill = tableHeaderFill;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { ARGB: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Filas de Insumos
      detalle_insumos.forEach((item) => {
        const diffVal = item.diferencia !== undefined ? item.diferencia : (item.stock_nuevo - item.stock_anterior);
        const diffStr = diffVal > 0 ? `+${diffVal} u.` : `${diffVal} u.`;

        const row = sheet.addRow([
          item.codigo || '—',
          item.nombre || '—',
          item.categoria || '—',
          item.stock_anterior !== undefined ? `${item.stock_anterior} u.` : '0 u.',
          item.stock_nuevo !== undefined ? `${item.stock_nuevo} u.` : '0 u.',
          diffStr
        ]);

        row.height = 20;

        // Alineación y Estilos
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(1).font = { name: 'Consolas', size: 9, bold: true };
        
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
        
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).font = { name: 'Consolas', size: 9 };
        
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).font = { name: 'Consolas', size: 9, bold: true };
        
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).font = { name: 'Consolas', size: 9, bold: true, color: { ARGB: diffVal > 0 ? 'FF047857' : diffVal < 0 ? 'FFB91C1C' : 'FF64748B' } };

        // Bordes suaves
        row.eachCell((c) => {
          c.border = {
            bottom: { style: 'thin', color: { ARGB: 'FFE2E8F0' } },
            right: { style: 'thin', color: { ARGB: 'FFE2E8F0' } },
            left: { style: 'thin', color: { ARGB: 'FFE2E8F0' } }
          };
        });
      });

      sheet.addRow([]);

      // Pie con firma/resguardo
      const footerRow = sheet.addRow(['', '', '', '', 'Firma Responsable:', '____________________']);
      footerRow.getCell(5).font = { bold: true, size: 10 };

      // Generar y Descargar Archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Acta_Conciliacion_${fecha_imputada || 'Historica'}_${area || 'Emergencia'}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);

      Swal.fire({
        title: 'Exportación Exitosa',
        text: 'El acta oficial de conciliación se descargó en formato Excel.',
        icon: 'success',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
    } catch (err) {
      console.error("Error al exportar acta de conciliación:", err);
      Swal.fire('Error', 'No se pudo generar el archivo Excel: ' + err.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-fade-in">
      <div className="glass-card bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header del Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 text-white rounded-2xl flex items-center justify-center shadow-xs shrink-0">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-tight">
                Acta de Toma Física y Conciliación
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Resumen oficial de diferencias de inventario e imputación histórica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs shrink-0"
              title="Exportar Acta Oficial a Excel"
            >
              <FileSpreadsheet size={14} />
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>
            
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Contenido Desplazable */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 font-data">

          {/* Tarjeta de Metadatos & Parámetros */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/70 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-500 shrink-0">
                  <Calendar size={15} />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Fecha Imputada</span>
                  <span className="font-bold text-slate-800 font-mono text-xs">{fecha_imputada || '—'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-500 shrink-0">
                  <User size={15} />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Responsable</span>
                  <span className="font-bold text-slate-800 text-xs">{usuario || '—'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-500 shrink-0">
                  <Building2 size={15} />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Área / Servicio</span>
                  <span className="font-bold text-slate-800 text-xs">{area || '—'}</span>
                </div>
              </div>

            </div>

            {/* Justificación Obligatoria */}
            <div className="pt-2.5 border-t border-slate-200/60 flex items-start gap-2 text-xs">
              <FileText size={15} className="text-slate-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Justificación de la Conciliación</span>
                <p className="text-slate-700 font-medium text-xs leading-relaxed italic mt-0.5">
                  "{justificacion || 'Sin justificación registrada'}"
                </p>
              </div>
            </div>
          </div>

          {/* Tarjetas de Resumen Rápido de Métricas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-white rounded-2xl border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Ajustados</span>
              <span className="font-mono text-base font-bold text-slate-800">{total_insumos || detalle_insumos.length} insumo(s)</span>
            </div>

            <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200/60 text-center">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Sobrantes (+)</span>
              <span className="font-mono text-base font-bold text-emerald-700">+{total_aumentos || 0}</span>
            </div>

            <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-200/60 text-center">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Faltantes (-)</span>
              <span className="font-mono text-base font-bold text-rose-700">{total_faltantes || 0}</span>
            </div>
          </div>

          {/* Tabla de Detalle de Insumos Ajustados */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200/60 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Desglose Insumo por Insumo</span>
              <span className="text-[11px] text-slate-400 font-normal font-mono">{detalle_insumos.length} registros</span>
            </div>

            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-xs text-[11px] font-semibold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="pl-4 pr-2 py-2 w-28">Código</th>
                    <th className="px-3 py-2">Insumo Médico / Medicamento</th>
                    <th className="px-3 py-2 text-center w-32">Stock Sistema</th>
                    <th className="px-3 py-2 text-center w-36">Stock Físico Real</th>
                    <th className="px-4 py-2 text-center w-32">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {detalle_insumos.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-400 italic">No hay desglose de insumos disponible.</td>
                    </tr>
                  ) : (
                    detalle_insumos.map((item, idx) => {
                      const diffVal = item.diferencia !== undefined ? item.diferencia : (item.stock_nuevo - item.stock_anterior);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="pl-4 pr-2 py-2.5 font-mono text-xs font-bold text-primary-600">
                            #{item.codigo}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-800 text-xs">{item.nombre}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{item.categoria}</div>
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono font-semibold text-slate-600">
                            {item.stock_anterior !== undefined ? item.stock_anterior : 0} u.
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">
                            {item.stock_nuevo !== undefined ? item.stock_nuevo : 0} u.
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {diffVal > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ArrowUpRight size={12} /> +{diffVal} u.
                              </span>
                            ) : diffVal < 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <ArrowDownRight size={12} /> {diffVal} u.
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                                <CheckCircle2 size={12} className="text-emerald-500" /> Sin cambio
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Footer del Modal */}
        <div className="p-3.5 px-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-medium text-slate-400">
            Firma / Comprobante de Inventario Institucional
          </span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};

export default ConciliacionDetailModal;
