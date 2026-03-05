/**
 * Generates a Word document (.docx) for recommendation letters
 * Creates a proper .docx file using Office Open XML format
 */

interface WordData {
  projectName: string;
  client: string;
  location: string;
  completionDate: string;
  poNumber: string;
  manager: string;
  clientContact: string;
}

/**
 * Escapes XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a Word document blob from the provided data
 * @param data - The data to populate the recommendation letter
 * @returns A Blob representing a Word document (.docx)
 */
export async function generateRecommendationLetterWord(data: WordData): Promise<Blob> {
  // Format the completion date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formattedDate = formatDate(data.completionDate);
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Escape XML content
  const safeProjectName = escapeXml(data.projectName);
  const safeClient = escapeXml(data.client);
  const safeLocation = escapeXml(data.location);
  const safeClientContact = escapeXml(data.clientContact);
  const safeManager = escapeXml(data.manager);
  const safePoNumber = escapeXml(data.poNumber);

  // Create the main document XML (document.xml)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="28"/>
        </w:rPr>
        <w:t>RECOMMENDATION LETTER</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Date: ${escapeXml(currentDate)}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>To,</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>${safeClientContact}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>${safeClient}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>${safeLocation}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Subject: Recommendation Letter - ${safeProjectName}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Dear ${safeClientContact},</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>We are pleased to provide this recommendation letter for the project "${safeProjectName}" (PO Number: ${safePoNumber}) which was successfully completed on ${escapeXml(formattedDate)}.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>The project was managed by ${safeManager} and was executed to our satisfaction. We appreciate the professional collaboration and look forward to future opportunities to work together.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>If you have any questions or require additional information, please do not hesitate to contact us.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Sincerely,</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t/></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Project Management Team</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="708"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  // Create [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  // Create _rels/.rels
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // Create word/_rels/document.xml.rels
  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  // Try to use JSZip if available (via CDN), otherwise create a simple structure
  // For now, we'll create a minimal .docx using a simple approach
  // A proper .docx is a ZIP file, but we'll use a workaround with RTF that Word can open
  
  // Check if JSZip is available in window
  if (typeof window !== 'undefined' && (window as any).JSZip) {
    const JSZip = (window as any).JSZip;
    const zip = new JSZip();
    
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', relsXml);
    zip.file('word/document.xml', documentXml);
    zip.file('word/_rels/document.xml.rels', wordRelsXml);
    
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return blob;
  }

  // Fallback: Create RTF format that Word can open (works with .doc extension)
  const rtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
{\\colortbl ;\\red0\\green0\\blue0;}
\\f0\\fs24 
\\b RECOMMENDATION LETTER\\b0\\par
\\par
Date: ${currentDate}\\par
\\par
To,\\par
${data.clientContact}\\par
${data.client}\\par
${data.location}\\par
\\par
Subject: Recommendation Letter - ${data.projectName}\\par
\\par
Dear ${data.clientContact},\\par
\\par
We are pleased to provide this recommendation letter for the project "${data.projectName}" (PO Number: ${data.poNumber}) which was successfully completed on ${formattedDate}.\\par
\\par
The project was managed by ${data.manager} and was executed to our satisfaction. We appreciate the professional collaboration and look forward to future opportunities to work together.\\par
\\par
If you have any questions or require additional information, please do not hesitate to contact us.\\par
\\par
\\par
Sincerely,\\par
\\par
Project Management Team\\par
}`;

  return new Blob([rtfContent], { type: 'application/msword' });
}

