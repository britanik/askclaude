import axios from 'axios';

interface TelegraphResponse {
  ok: boolean;
  result?: {
    url: string;
    path: string;
    title: string;
  };
  error?: string;
}

/**
 * Uploads content to Telegraph and returns the link
 * @param title Title of the Telegraph page
 * @param content HTML content to upload
 * @returns URL of the created Telegraph page
 */
export async function uploadToTelegraph(title: string, content: string): Promise<string> {
  try {
    const response = await axios.post<TelegraphResponse>(
      'https://api.telegra.ph/createPage',
      {
        access_token: process.env.TELEGRAPH_TOKEN,
        title: title || 'Code Snippet',
        author_name: 'AskClaude',
        content: JSON.stringify([
          {
            tag: 'pre',
            children: [content]
          }
        ]),
        return_content: false
      }
    );

    console.log('Telegraph response:', response.data);

    if (response.data.ok && response.data.result) {
      return response.data.result.url;
    } else {
      console.error('Telegraph API error:', response.data.error);
      throw new Error(response.data.error || 'Failed to upload to Telegraph');
    }
  } catch (error) {
    console.error('Error uploading to Telegraph:', error);
    throw error;
  }
}

/**
 * Extracts pre blocks from text and replaces them with Telegraph links
 * @param text Original text with pre blocks
 * @returns Text with pre blocks replaced by Telegraph links
 */
export async function processMessageWithCodeBlocks(text: string): Promise<string> {
  // Regular expression to match <pre>...</pre> blocks
  const preBlockRegex = /<pre>([\s\S]*?)<\/pre>/g;
  
  let result = text;
  let match;
  let index = 1;
  
  // Use a Map to store the replacements we'll make
  const replacements = new Map();
  
  while ((match = preBlockRegex.exec(text)) !== null) {
    const fullMatch = match[0]; // The entire <pre>...</pre> block
    const codeContent = match[1]; // Just the content inside the pre tags
    
    try {
      // Upload to Telegraph
      const title = `Code Snippet ${index++}`;
      const telegraphUrl = await uploadToTelegraph(title, codeContent);
      
      // Store the replacement
      replacements.set(fullMatch, `➡️ <a href="${telegraphUrl}">${title}</a>`);
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