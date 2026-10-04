const sheetId = '1_UcK3thUuQt7YwIVrKS4Rp1zvEUfdh-Y_UNJ05lphRw';
const exportUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:csv&sheet=siswa';
fetch(exportUrl)
  .then(res => res.text())
  .then(d => console.log('Siswa CSV:', d))
  .catch(console.error);
