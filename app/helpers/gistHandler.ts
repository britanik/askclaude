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
  
  // Detect the language if present
  const langDetectRegex = /^```([a-zA-Z0-9]+)\n/;
  
  while ((match = preBlockRegex.exec(text)) !== null) {
    const fullMatch = match[0]; // The entire <pre>...</pre> block
    let codeContent = match[1]; // Just the content inside the pre tags
    
    // Check if the code starts with a markdown code block with language
    let filename = 'code.txt';
    const langMatch = codeContent.match(langDetectRegex);
    
    if (langMatch) {
      // Extract language and set appropriate file extension
      const lang = langMatch[1].toLowerCase();
      codeContent = codeContent.replace(langDetectRegex, ''); // Remove the language marker
      
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
        'bash': 'sh'
      };
      
      filename = `code.${extMap[lang] || 'txt'}`;
    }
    
    // If the code ends with a markdown code block closer, remove it
    if (codeContent.endsWith('```')) {
      codeContent = codeContent.slice(0, -3);
    }
    
    try {
      // Upload to GitHub Gist
      const title = `Код #${index++}`;
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