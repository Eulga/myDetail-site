const button = document.getElementById('print-button');
if (button) {
  button.addEventListener('click', () => window.print());
  button.hidden = false;
}
