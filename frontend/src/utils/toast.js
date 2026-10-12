import Swal from 'sweetalert2';

/**
 * Notificación central auto-cerrable (1.6s) sin botón OK
 * Unifica el estilo visual de confirmación de acciones completadas con éxito.
 */
export const showSuccessToast = (text, title = '¡Éxito!') => {
  Swal.fire({
    title: title,
    text: text,
    icon: 'success',
    timer: 1600,
    showConfirmButton: false
  });
};

/**
 * Notificación central informativa auto-cerrable (1.6s)
 */
export const showInfoToast = (text, title = 'Información') => {
  Swal.fire({
    title: title,
    text: text,
    icon: 'info',
    timer: 1600,
    showConfirmButton: false
  });
};
