const button = document.getElementById('pdf-button');
if (button) {
  const status = document.getElementById('jspdf-export-status');
  const resume = document.getElementById('main-content');
  const desktopWidth = getComputedStyle(resume).getPropertyValue('--content-width');
  button.dataset.captureWidth = Number.parseFloat(desktopWidth);

  button.addEventListener('click', async () => {
    if (button.disabled) return;

    // Use a fixed desktop layout for page-break measurement and canvas rendering.
    const capture = resume.cloneNode(true);
    capture.id = 'pdf-capture';
    capture.inert = true;
    capture.setAttribute('aria-hidden', 'true');
    capture.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    document.body.append(capture);

    try {
      await window.jspdfExport.exportFromTrigger(button);
    } catch (error) {
      status.textContent = 'PDF 저장 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
      status.classList.add('is-error');
      console.error(error);
    } finally {
      capture.remove();
    }
  });
  button.hidden = false;
}
