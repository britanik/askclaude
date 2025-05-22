import axios from 'axios';

interface GistResponse {
  html_url: string;
  id: string;
  description: string;
}

export async function uploadToGist(title: string, content: string, filename: string = 'code.txt'): Promise<string> {
  try {
    // Create request body for GitHub API
    const requestBody = {
      description: title || 'Code Snippet',
      public: false, // Make private by default for better security
      files: {
        [filename]: {
          content: content
        }
      }
    };

    // Make API request to GitHub
    const response = await axios.post<GistResponse>(
      'https://api.github.com/gists',
      requestBody,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    console.log('Gist created with ID:', response.data.id);
    
    // Return the HTML URL to the Gist
    return response.data.html_url;
  } catch (error) {
    console.error('Error uploading to GitHub Gist:', error);
    
    if (axios.isAxiosError(error) && error.response) {
      console.error('GitHub API error:', error.response.data);
    }
    
    throw error;
  }
}

/**
 * Extracts pre blocks from text and replaces them with GitHub Gist links
 * @param text Original text with pre blocks
 * @returns Text with pre blocks replaced by Gist links
 */
export async function processMessageWithCodeBlocks(text: string): Promise<string> {
  // Regular expression to match <pre>...</pre> blocks
  const preBlockRegex = /<pre>([\s\S]*?)<\/pre>/g;
  
  let result = text;
  let match;
  let index = 1;
  
  // Use a Map to store the replacements we'll make
  const replacements = new Map();
  
  // Detect the language from markdown code blocks
  const markdownLangDetectRegex = /^```([a-zA-Z0-9]+)\n/;
  
  // Detect the language from HTML code tags (with optional name attribute)
  const htmlCodeTagRegex = /<code class="language-([a-zA-Z0-9]+)"(?:\s+name="([^"]*)")?>([\s\S]*?)<\/code>/;
  
  while ((match = preBlockRegex.exec(text)) !== null) {
    const fullMatch = match[0]; // The entire <pre>...</pre> block
    let codeContent = match[1]; // Just the content inside the pre tags
    
    let filename = 'code.txt';
    let detectedLang = null;
    
    // First, check if there's an HTML code tag with language class
    const htmlCodeMatch = codeContent.match(htmlCodeTagRegex);
    if (htmlCodeMatch) {
      detectedLang = htmlCodeMatch[1].toLowerCase();
      const nameAttribute = htmlCodeMatch[2]; // This will be the filename if present
      // Extract only the content inside the <code> tags, removing the HTML tags
      codeContent = htmlCodeMatch[3];
      
      // Use the name attribute as filename if provided
      if (nameAttribute && nameAttribute.trim()) {
        filename = nameAttribute.trim();
      }
    } else {
      // Check if the code starts with a markdown code block with language
      const markdownMatch = codeContent.match(markdownLangDetectRegex);
      if (markdownMatch) {
        detectedLang = markdownMatch[1].toLowerCase();
        // Remove the markdown language marker
        codeContent = codeContent.replace(markdownLangDetectRegex, '');
      }
    }
    
    // Set appropriate file extension based on detected language (only if no name attribute was provided)
    if (detectedLang && (!htmlCodeMatch || !htmlCodeMatch[2] || !htmlCodeMatch[2].trim())) {
      // Map common languages to file extensions
      const extMap: {[key: string]: string} = {
        'js': 'js',
        'javascript': 'js',
        'ts': 'ts',
        'typescript': 'ts',
        'python': 'py',
        'py': 'py',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'php': 'php',
        'ruby': 'rb',
        'go': 'go',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'csharp': 'cs',
        'cs': 'cs',
        'swift': 'swift',
        'kotlin': 'kt',
        'rust': 'rs',
        'sh': 'sh',
        'bash': 'sh',
        'sql': 'sql',
        'xml': 'xml',
        'yaml': 'yml',
        'yml': 'yml'
      };
      
      filename = `code.${extMap[detectedLang] || 'txt'}`;
    }
    
    // If the code ends with a markdown code block closer, remove it
    if (codeContent.endsWith('```')) {
      codeContent = codeContent.slice(0, -3);
    }
    
    // Clean up any remaining whitespace
    codeContent = codeContent.trim();
    
    try {
      // Upload to GitHub Gist
      const title = `Код #${index++} (GitHub)`;
      const gistUrl = await uploadToGist(title, codeContent, filename);
      
      // Store the replacement
      replacements.set(fullMatch, `➡️ <a href="${gistUrl}">${title}</a>`);
    } catch (error) {
      console.error('Failed to process pre block:', error);
      // If upload fails, keep the original content
    }
  }
  
  // Apply all replacements at once
  for (const [original, replacement] of replacements.entries()) {
    result = result.replace(original, replacement);
  }
  
  return result;
}