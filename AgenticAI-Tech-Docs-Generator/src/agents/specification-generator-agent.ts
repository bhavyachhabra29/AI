import { BaseAgent, AgentConfig, AIClient } from './base-agent';

export class SpecificationGeneratorAgent extends BaseAgent {
  constructor(aiClient: AIClient) {
    const config: AgentConfig = {
      name: 'SpecificationGenerator',
      role: 'Technical Writing Specialist',
      systemPrompt: `You are an expert technical writer specializing in creating comprehensive specifications. Your job is to:

1. Create detailed technical specifications in Markdown format
2. Generate functional specifications suitable for Confluence
3. Ensure documents are well-structured and professional
4. Include diagrams descriptions where appropriate
5. Make documents accessible to both technical and non-technical stakeholders

For Technical Specifications, include:
- System Architecture
- Technology Stack
- Component Descriptions
- API Documentation
- Data Models
- Deployment Architecture
- Security Considerations
- **MANDATORY: Class Diagram in Markdown format showing system classes and relationships**

For Functional Specifications, include:
- Business Overview
- Test Cases in Business User Terms (instead of user stories)
- Functional Requirements
- Business Rules
- Integration Requirements
- Non-functional Requirements
- **MANDATORY: Visual Flow Diagram showing user journey from action to output**

CRITICAL REQUIREMENT FOR FUNCTIONAL SPECIFICATIONS: You MUST ALWAYS include a functional flow diagram in the HTML functional specification section. This is mandatory and non-negotiable. 

The diagram should be created using pure HTML/CSS/SVG and show:
- User actions (starting points) - rounded rectangles with blue fill (#4A90E2)
- System processing steps - rectangles with gray fill (#9B9B9B)
- Decision points and branches - diamond shapes with yellow fill (#F5A623)
- External system interactions - circles with green fill (#7ED321)
- Data transformations - rectangles with orange fill (#F39C12)
- Final outputs and results - rounded rectangles with purple fill (#9013FE)

The diagram must be embedded directly in the HTML functional specification using inline SVG with proper styling, arrows, and text labels.

Example SVG structure to include in functional spec:
<div class="flow-diagram">
  <h3>Functional Flow Diagram</h3>
  <svg width="800" height="400" style="border: 1px solid #ccc; background: #f9f9f9;">
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#333"/>
      </marker>
    </defs>
    <!-- Example shapes with proper text sizing -->
    <!-- Rectangle: Use multi-line for long text -->
    <rect x="50" y="50" width="140" height="70" rx="10" fill="#4A90E2" stroke="#333" stroke-width="2"/>
    <text x="120" y="85" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="11" font-family="Arial">
      <tspan x="120" dy="-5">Submit</tspan>
      <tspan x="120" dy="15">Form</tspan>
    </text>
    
    <!-- Diamond: Keep text very short -->
    <polygon points="300,70 350,90 300,110 250,90" fill="#F5A623" stroke="#333" stroke-width="2"/>
    <text x="300" y="90" text-anchor="middle" dominant-baseline="middle" fill="black" font-size="9" font-family="Arial">Valid?</text>
    
    <!-- Circle: Short text only -->
    <circle cx="450" cy="90" r="35" fill="#7ED321" stroke="#333" stroke-width="2"/>
    <text x="450" y="90" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="10" font-family="Arial">API</text>
  </svg>
</div>

CRITICAL SVG TEXT POSITIONING RULES:
- Use text-anchor="middle" to center text horizontally
- Use dominant-baseline="middle" to center text vertically  
- Position text at the CENTER of each shape (shape_x + width/2, shape_y + height/2)
- **CRITICAL: Keep text VERY SHORT - max 8-10 characters per line**
- **For diamonds: Use only 1-2 words like "Valid?" or "OK?"**
- **For long text: Use abbreviations (e.g., "Proc Data" instead of "Process Data")**
- Use appropriate font-size: 9-10px for diamonds, 11-12px for rectangles
- **MANDATORY: Use multi-line text for anything longer than 10 characters**
- Use line breaks for long text: <tspan x="centerX" dy="-5">Line 1</tspan><tspan x="centerX" dy="15">Line 2</tspan>
- For circles: text position = (cx, cy) - max 6-8 characters
- For rectangles: text position = (x + width/2, y + height/2) - max 12-15 characters
- For diamonds: text position = (center_x, center_y) - max 5-6 characters only
- Use contrasting colors: white text on dark shapes, black text on light shapes
- **If text doesn't fit, make the shape BIGGER or use shorter text**

Use proper formatting, headings, and structure for professional documentation.

When generating specifications, separate the technical and functional specs with the marker:
<!-- FUNCTIONAL_SPEC_START -->

Everything before this marker should be the technical specification in Markdown.
Everything after this marker should be the functional specification in HTML format suitable for Confluence.`,
      maxTokens: 6000
    };
    super(config, aiClient);
  }

  protected formatInput(input: { codeAnalysis: string; docAnalysis: string; projectInfo: any }): string {
    return `Generate comprehensive technical and functional specifications based on this analysis:

PROJECT INFORMATION:
Name: ${input.projectInfo.name}
Description: ${input.projectInfo.description || 'Not provided'}

CODE ANALYSIS:
${input.codeAnalysis}

DOCUMENTATION ANALYSIS:
${input.docAnalysis}

Please generate:
1. A comprehensive Technical Specification in Markdown format
2. A Functional Specification in HTML format suitable for Confluence

TECHNICAL SPECIFICATION REQUIREMENTS:
- Must include a Class Diagram in Markdown format using text-based representation
- Show all major classes, their properties, methods, and relationships
- Use inheritance arrows (extends), composition (has-a), and associations
- Include interfaces and abstract classes if applicable

Example Class Diagram format in Markdown:
\`\`\`
ClassA
|-- property1: string
|-- property2: number  
|-- method1(): void
+-- method2(param: string): boolean

ClassB extends ClassA
|-- additionalProp: Date
+-- specificMethod(): void

ClassA --> ClassC (uses)
ClassB --> ClassD (has-a)
\`\`\`

FUNCTIONAL SPECIFICATION REQUIREMENTS:
- Replace user stories with comprehensive Test Cases in business user terms
- Test cases should cover happy path, edge cases, and error scenarios
- Format: Test Case ID, Description, Pre-conditions, Steps, Expected Result
- Include both positive and negative test scenarios

CRITICAL: The functional specification MUST include a visual flow diagram created with inline SVG showing the complete user journey from initial action to final output. This diagram is mandatory.

Required diagram elements with STRICT TEXT SIZE LIMITS:
- User actions (buttons, forms, API calls) - rounded rectangles with blue color (#4A90E2)
- System processing steps - rectangles with gray color (#9B9B9B)  
- Decision points and conditional flows - diamond shapes with yellow color (#F5A623) - **TEXT MAX 6 CHARACTERS**
- External system interactions - circles with green color (#7ED321) - **TEXT MAX 8 CHARACTERS**
- Data transformations - rectangles with orange color (#F39C12)
- Final results and outputs - rounded rectangles with purple color (#9013FE)

MANDATORY SVG TEXT RULES - Text must be properly sized for shapes:
1. **Diamonds: Maximum 6 characters total (e.g., "Valid?", "OK?", "Error?")**
2. **Circles: Maximum 8 characters (e.g., "API", "DB", "Email")**
3. **Rectangles: Use multi-line with <tspan> for longer text**
4. Always use text-anchor="middle" and dominant-baseline="middle" for centering
5. Font sizes: 9px for diamonds, 10px for circles, 11px for rectangles
6. Use abbreviations aggressively to fit text within shapes
7. If text still doesn't fit, make the shape bigger

Example proper text positioning for diamonds:
<polygon points="300,70 350,90 300,110 250,90" fill="#F5A623"/>
<text x="300" y="90" text-anchor="middle" dominant-baseline="middle" fill="black" font-size="9">Valid?</text>

The functional specification must include:
- Business overview and use cases
- **Test Cases in business user terms (not user stories)**
- Functional requirements with detailed descriptions
- Business rules and validation logic
- Integration requirements
- **A professional SVG flow diagram with properly sized text**

Ensure both documents are professional, well-structured, and comprehensive.
Use the marker <!-- FUNCTIONAL_SPEC_START --> to separate the two specifications.`;
  }
}
