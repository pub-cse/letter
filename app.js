const templateFiles = [
  {
    name: "Professional Letter",
    file: "Templates/professional_letter.json",
  },
  { name: "Invoice Template", file: "Templates/invoice.json" },
  { name: "Business Proposal", file: "Templates/business_proposal.json" },
];

const templateFileByName = Object.fromEntries(
  templateFiles.map((template) => [template.name, template.file]),
);

let currentPreviewUrl = null;
let previewRenderTimer = null;
let lastPreviewKey = "";
let currentTemplateSource = null;
let currentTemplateName = "";
let uploadedTemplateCounter = 0;
let csvRows = [];
let currentPdfBlob = null;

document.addEventListener("DOMContentLoaded", function () {
  loadTemplates();
  setupVariableRowManagement();
  setupPreviewUpdates();
  setupTemplateActions();
  setupCsvActions();
  setupPrintAction();
  schedulePdfPreviewRender();
});

function loadTemplates() {
  const templateSelect = document.getElementById("template");

  templateSelect.innerHTML =
    '<option value="">-- Choose a template --</option>';

  templateFiles.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.name;
    option.textContent = template.name;
    templateSelect.appendChild(option);
  });

  templateSelect.addEventListener("change", function (event) {
    const selectedTemplateName = event.target.value;
    if (selectedTemplateName) {
      loadTemplate(selectedTemplateName);
    }
  });
}

function loadTemplate(templateName) {
  const templateSource = templateFileByName[templateName];

  if (!templateSource) {
    console.error("Template not found:", templateName);
    return;
  }

  if (typeof templateSource === "object") {
    currentTemplateSource = templateSource;
    currentTemplateName = templateName;
    loadTemplateFromData(templateSource);
    schedulePdfPreviewRender();
    return;
  }

  fetch(templateSource)
    .then((response) => response.json())
    .then((template) => {
      currentTemplateSource = template;
      currentTemplateName = templateName || template.name || "";

      if (template.variables && Array.isArray(template.variables)) {
        populateVariablesFromTemplate(template.variables);
      }

      if (template.letterContent) {
        document.getElementById("letter").value = template.letterContent;
      }

      if (template.settings) {
        if (template.settings.fontSize) {
          document.getElementById("font-size").value =
            template.settings.fontSize;
        }
        if (template.settings.fontFace) {
          document.getElementById("font-face").value =
            template.settings.fontFace;
        }
        if (template.settings.pageSize) {
          document.getElementById("page-size").value =
            template.settings.pageSize;
        }
        if (template.settings.margins) {
          document.getElementById("margin-top").value =
            template.settings.margins.top || 1;
          document.getElementById("margin-right").value =
            template.settings.margins.right || 1;
          document.getElementById("margin-bottom").value =
            template.settings.margins.bottom || 1;
          document.getElementById("margin-left").value =
            template.settings.margins.left || 1;
        }
      }

      schedulePdfPreviewRender();
    })
    .catch((error) => console.error("Error loading template:", error));
}

function setupTemplateActions() {
  const downloadButton = document.getElementById("download-template");
  const uploadButton = document.getElementById("upload-template-button");
  const uploadInput = document.getElementById("upload-template-input");

  downloadButton.addEventListener("click", downloadCurrentTemplate);
  uploadButton.addEventListener("click", function () {
    uploadInput.click();
  });

  uploadInput.addEventListener("change", handleTemplateUpload);
}

function setupCsvActions() {
  const uploadButton = document.getElementById("upload-csv-button");
  const uploadInput = document.getElementById("upload-csv-input");
  const generateButton = document.getElementById("generate-bulk-pdf");

  uploadButton.addEventListener("click", function () {
    uploadInput.click();
  });

  uploadInput.addEventListener("change", handleCsvUpload);
  generateButton.addEventListener("click", generateBulkPdfZip);
}

function setupPrintAction() {
  const printButton = document.getElementById("print-pdf");
  printButton.addEventListener("click", function () {
    const shell = document.querySelector(".preview-shell");
    const iframe = shell ? shell.querySelector(".preview-frame") : null;

    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  });
}

function downloadCurrentTemplate() {
  const templateData = buildCurrentTemplateData();
  const templateName = templateData.name || currentTemplateName || "template";
  const fileName =
    templateName.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".json";
  const blob = new Blob([JSON.stringify(templateData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCurrentTemplateData() {
  const templateName =
    currentTemplateName || currentTemplateSource?.name || "Custom Template";

  return {
    name: templateName,
    settings: {
      fontSize: document.getElementById("font-size").value,
      fontFace: document.getElementById("font-face").value,
      pageSize: document.getElementById("page-size").value,
      margins: {
        top: Number(document.getElementById("margin-top").value) || 1,
        right: Number(document.getElementById("margin-right").value) || 1,
        bottom: Number(document.getElementById("margin-bottom").value) || 1,
        left: Number(document.getElementById("margin-left").value) || 1,
      },
    },
    variables: Array.from(document.querySelectorAll(".variable-row")).map(
      (row) => ({
        name: row.querySelector(".variable-name")?.value || "",
        value: row.querySelector(".variable-value")?.value || "",
      }),
    ),
    letterContent: document.getElementById("letter").value,
  };
}

function handleTemplateUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
    try {
      const template = JSON.parse(reader.result);
      const templateName =
        template.name || `Uploaded Template ${++uploadedTemplateCounter}`;
      addUploadedTemplateOption(templateName, template);
      currentTemplateSource = template;
      currentTemplateName = templateName;
      loadTemplateFromData(template);
      document.getElementById("template").value = templateName;
      schedulePdfPreviewRender();
    } catch (error) {
      alert("Invalid template JSON file.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function handleCsvUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
    try {
      csvRows = parseCsvToObjects(String(reader.result || ""));
      updateCsvStatus(
        csvRows.length
          ? `${csvRows.length} CSV row(s) loaded.`
          : "CSV uploaded, but no data rows were found.",
      );
    } catch (error) {
      csvRows = [];
      updateCsvStatus("Invalid CSV file.");
      alert("Unable to read the CSV file.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function updateCsvStatus(message) {
  const status = document.getElementById("csv-status");
  if (status) {
    status.textContent = message;
  }
}

function parseCsvToObjects(csvText) {
  const rows = parseCsvRows(csvText).filter((row) => row.length > 0);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] || "").trim();
    });
    return record;
  });
}

function parseCsvRows(csvText) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];

    if (character === '"') {
      if (insideQuotes && csvText[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && csvText[index + 1] === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function addUploadedTemplateOption(templateName, templateData) {
  const templateSelect = document.getElementById("template");
  if (templateFileByName[templateName]) {
    return;
  }

  const optionExists = Array.from(templateSelect.options).some(
    (option) => option.value === templateName,
  );

  if (!optionExists) {
    const option = document.createElement("option");
    option.value = templateName;
    option.textContent = templateName;
    templateSelect.appendChild(option);
  }

  templateFileByName[templateName] = templateData;
}

function loadTemplateFromData(template) {
  if (template.variables && Array.isArray(template.variables)) {
    populateVariablesFromTemplate(template.variables);
  }

  if (template.letterContent) {
    document.getElementById("letter").value = template.letterContent;
  }

  if (template.settings) {
    if (template.settings.fontSize) {
      document.getElementById("font-size").value = template.settings.fontSize;
    }
    if (template.settings.fontFace) {
      document.getElementById("font-face").value = template.settings.fontFace;
    }
    if (template.settings.pageSize) {
      document.getElementById("page-size").value = template.settings.pageSize;
    }
    if (template.settings.margins) {
      document.getElementById("margin-top").value =
        template.settings.margins.top || 1;
      document.getElementById("margin-right").value =
        template.settings.margins.right || 1;
      document.getElementById("margin-bottom").value =
        template.settings.margins.bottom || 1;
      document.getElementById("margin-left").value =
        template.settings.margins.left || 1;
    }
  }
}

function populateVariablesFromTemplate(variables) {
  const variableContainer = document.getElementById("variableContainer");
  variableContainer.innerHTML = "";

  variables.forEach((variable) => {
    const newRow = document.createElement("div");
    newRow.className = "variable-row";
    newRow.innerHTML = `
      <button class="delete-variable" type="button">−</button>
      <input
        type="text"
        placeholder="Variable Name"
        class="variable-name"
        value="${variable.name || ""}"
      />
      <input
        type="text"
        placeholder="Variable Value"
        class="variable-value"
        value="${variable.value || ""}"
      />
      <button class="add-variable" type="button">+</button>
    `;
    variableContainer.appendChild(newRow);
  });
}

function setupPreviewUpdates() {
  const watchedSelectors = [
    "#font-face",
    "#font-size",
    "#page-size",
    "#margin-top",
    "#margin-right",
    "#margin-bottom",
    "#margin-left",
    "#letter",
    "#template",
  ];

  watchedSelectors.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) {
      element.addEventListener("input", schedulePdfPreviewRender);
      element.addEventListener("change", schedulePdfPreviewRender);
    }
  });

  document
    .getElementById("variableContainer")
    .addEventListener("input", schedulePdfPreviewRender);
}

function setupVariableRowManagement() {
  const variableContainer = document.getElementById("variableContainer");

  variableContainer.addEventListener("click", function (event) {
    if (event.target.classList.contains("delete-variable")) {
      event.preventDefault();
      const row = event.target.closest(".variable-row");
      if (variableContainer.querySelectorAll(".variable-row").length > 1) {
        row.remove();
      }
    }

    if (event.target.classList.contains("add-variable")) {
      event.preventDefault();
      addNewVariableRow();
      schedulePdfPreviewRender();
    }
  });
}

function addNewVariableRow() {
  const variableContainer = document.getElementById("variableContainer");
  const newRow = document.createElement("div");
  newRow.className = "variable-row";

  newRow.innerHTML = `
    <button class="delete-variable" type="button">−</button>
    <input
      type="text"
      placeholder="Variable Name"
      class="variable-name"
    />
    <input
      type="text"
      placeholder="Variable Value"
      class="variable-value"
    />
    <button class="add-variable" type="button">+</button>
  `;

  variableContainer.appendChild(newRow);
}

function getSelectedPageSize() {
  const pageSize = document.getElementById("page-size").value;

  switch (pageSize) {
    case "letter":
      return [8.5, 11];
    case "legal":
      return [8.5, 14];
    case "a4":
    default:
      return [8.27, 11.69];
  }
}

function getFontFamily() {
  const fontFace = document.getElementById("font-face").value;

  switch (fontFace) {
    case "times-new-roman":
      return "times";
    case "arial":
      return "helvetica";
    case "calibri":
    default:
      return "helvetica";
  }
}

function getVariableValues() {
  const variableRows = document.querySelectorAll(".variable-row");
  const variableValues = {};

  variableRows.forEach((row) => {
    const nameInput = row.querySelector(".variable-name");
    const valueInput = row.querySelector(".variable-value");
    const variableName = nameInput ? nameInput.value.trim() : "";

    if (variableName) {
      variableValues[variableName] = valueInput ? valueInput.value : "";
    }
  });

  return variableValues;
}

function applyVariablesToText(text, variableValues) {
  let outputText = text || "";

  Object.keys(variableValues).forEach((variableName) => {
    const pattern = new RegExp(`\\[${variableName}\\]`, "g");
    outputText = outputText.replace(pattern, variableValues[variableName]);
  });

  return outputText;
}

function buildPdfBlob(variableValues = getVariableValues()) {
  if (typeof window.jspdf === "undefined") {
    return null;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "in",
    format: getSelectedPageSize(),
  });

  const fontSize = Number(document.getElementById("font-size").value) || 12;
  const marginTop = Number(document.getElementById("margin-top").value) || 1;
  const marginRight =
    Number(document.getElementById("margin-right").value) || 1;
  const marginBottom =
    Number(document.getElementById("margin-bottom").value) || 1;
  const marginLeft = Number(document.getElementById("margin-left").value) || 1;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginLeft - marginRight;
  const lineHeight = (fontSize / 72) * 1.35;
  const fontFamily = getFontFamily();
  const rawText = document.getElementById("letter").value;
  const letterText = applyVariablesToText(rawText, variableValues);
  const lines = pdf.splitTextToSize(letterText || "", usableWidth);

  pdf.setFont(fontFamily, "normal");
  pdf.setFontSize(fontSize);

  let currentY = marginTop;

  lines.forEach((line) => {
    if (currentY + lineHeight > pageHeight - marginBottom) {
      pdf.addPage();
      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(fontSize);
      currentY = marginTop;
    }

    pdf.text(line, marginLeft, currentY);
    currentY += lineHeight;
  });

  return pdf.output("blob");
}

function schedulePdfPreviewRender() {
  const previewContainer = document.querySelector(".preview");
  if (!previewContainer) {
    return;
  }

  if (previewRenderTimer) {
    clearTimeout(previewRenderTimer);
  }

  previewRenderTimer = setTimeout(function () {
    renderPdfPreview();
  }, 2000);
}

function ensurePreviewShell() {
  const previewContainer = document.querySelector(".preview");
  if (!previewContainer) {
    return null;
  }

  let shell = previewContainer.querySelector(".preview-shell");
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "preview-shell";
    shell.innerHTML = `<iframe class="preview-frame" title="Generated PDF Preview"></iframe>`;

    previewContainer.appendChild(shell);
  }

  return shell;
}

function getPreviewStateKey() {
  return JSON.stringify({
    fontFace: document.getElementById("font-face").value,
    fontSize: document.getElementById("font-size").value,
    pageSize: document.getElementById("page-size").value,
    marginTop: document.getElementById("margin-top").value,
    marginRight: document.getElementById("margin-right").value,
    marginBottom: document.getElementById("margin-bottom").value,
    marginLeft: document.getElementById("margin-left").value,
    letter: document.getElementById("letter").value,
    variables: getVariableValues(),
  });
}

function renderPdfPreview() {
  const previewContainer = document.querySelector(".preview");
  if (!previewContainer || typeof window.jspdf === "undefined") {
    return;
  }

  const previewKey = getPreviewStateKey();
  if (previewKey === lastPreviewKey) {
    return;
  }

  lastPreviewKey = previewKey;
  const shell = ensurePreviewShell();
  if (!shell) {
    return;
  }

  const iframe = shell.querySelector(".preview-frame");
  const variableValues = getVariableValues();
  const pdfBlob = buildPdfBlob(variableValues);
  if (!pdfBlob) {
    return;
  }

  const pdfUrl = URL.createObjectURL(pdfBlob);

  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
  }
  currentPreviewUrl = pdfUrl;
  currentPdfBlob = pdfBlob;

  iframe.src = pdfUrl;
}

function generateBulkPdfZip() {
  if (!csvRows.length) {
    alert("Please upload a CSV file first.");
    return;
  }

  if (typeof window.JSZip === "undefined") {
    alert("ZIP support is not available right now.");
    return;
  }

  const zip = new window.JSZip();
  const baseTemplateName = (currentTemplateName || "bulk_template")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  csvRows.forEach((row, index) => {
    const pdfBlob = buildPdfBlob(row);
    if (!pdfBlob) {
      return;
    }

    const rowName = row.name || row.Name || `row_${index + 1}`;
    const pdfFileName = `${baseTemplateName}_${
      String(rowName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_") || `row_${index + 1}`
    }.pdf`;

    zip.file(pdfFileName, pdfBlob);
  });

  zip.generateAsync({ type: "blob" }).then((content) => {
    const downloadUrl = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `${baseTemplateName}_bulk_pdfs.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  });
}
