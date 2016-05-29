'use strict';

var Convert = (function () {
    
    // Supported tags are taken from https://msdn.microsoft.com/en-us/library/5ast78ax.aspx
    // Note that <include> and <inheritdoc> tags are not supported!
    var processorMap = {
        'doc': processDoc,
        'assembly': processAssembly,        
        'members': processMembers,
        'member': processMember,
        'summary': processSummary,
        'value': processValue,
        'typeparam': processTypeparam,
        'remarks': processRemarks,
        'para': processPara,
        'param': processParam,
        'returns': processReturns,
        'example': processExample,
        'permission': processPermission,
        'exception': processException,
        'list': processList,
        'code': processCode,
        'seealso': processSeealso,
        'paramref': processParamref,
        'typeparamref': processTypeparamref,
        'see': processSee,        
        'c': processC,        
        '#text': processText
    };
    
    return {
        markdownToHtml: function (markdown) {
            // We use a vendor provided markdown to html parser called marked.
            // Ref: https://github.com/chjj/marked
            return marked(markdown);
        },

        vsdocToMarkdown: function (vsdoc) {
            var parser = new DOMParser();
            var xml = parser.parseFromString(vsdoc, 'text/xml');
            var ctx = {                
                markdown: [], // Output will be appended here.
                paramTypes: {}, // Used to map method signature names to types.
                nodeStack: [], // Used to keep track of current position in the node tree.
                types: [], // Table of contents will be generated based on types in assembly.
                indices: {} // Keeps track of indices of different document parts to later inject content.
            };
            
            stripEmptyTextNodes(xml);
            process(ctx, xml);
            
            // Attach table of contents before members.
            ctx.markdown.splice(ctx.indices.members, 0, getTableOfContents(ctx));            
            return ctx.markdown.join('');
        }
    };
    
    /*********************/
    /* 1. Tag processors */
    /*********************/

    function process(ctx, node) {
        for (var i = 0; i < node.childNodes.length; i++) {
            var childNode = node.childNodes[i];
            
            ctx.previousNode = (i === 0) ? undefined : node.childNodes[i - 1].nodeName;
            ctx.nextNode = (i === node.childNodes.length - 1) ? undefined : node.childNodes[i + 1].nodeName;
            
            ctx.nodeStack.push(childNode.nodeName);
            var processor = processorMap[childNode.nodeName];
            if (processor) processor(ctx, childNode);
            ctx.nodeStack.pop();
        }
    }

    function processDoc(ctx, docNode) {
        process(ctx, docNode);        
    }
    
    function processAssembly(ctx, assemblyNode) {
        var nameNode = findChildNode(assemblyNode, 'name');
        ctx.markdown.push('# ');        
        ctx.markdown.push(nameNode.textContent);
        ctx.markdown.push('\n');        
    }

    function processMembers(ctx, membersNode) {
        ctx.indices.members = ctx.markdown.length;
        
        // 1. Extract type and name from members.
        var childElements = [];
        for (var i = 0; i < membersNode.childNodes.length; i++) {
            var childNode = membersNode.childNodes[i];
            if (childNode.nodeType === Node.ELEMENT_NODE) {
                var childName = childNode.getAttribute('name');
                childNode.type = childName.substring(0, 1);
                childNode.name = sanitizeMarkdown(childName.substring(2));
                childElements.push(childNode);
            }
        }
        
        // 2. Sort members by their name.                
        childElements.sort(function (a, b) { 
            return a.name.localeCompare(b.name); 
        });
        
        // 3. Append sorted nodes back to their parent.
        for (var i = 0; i < childElements.length; i++) {
            membersNode.appendChild(childElements[i]);            
        }
        
        process(ctx, membersNode);
    }

    function processMember(ctx, memberNode) {
        var type = memberNode.type;
        var name = memberNode.name;        
        
        if (type === 'T') {
            ctx.namespace = name.substring(0, name.lastIndexOf('.'));
            name = name.replace(ctx.namespace + '.', '');
            ctx.typeName = name;
            
            ctx.markdown.push('\n\n## ');
            ctx.markdown.push(name);
            ctx.markdown.push('\n');
            
            ctx.types.push(name);
        } else { 
            if (type === 'M') {
                name = rearrangeParametersInContext(ctx, memberNode);
            }                 
            name = name.replace(ctx.namespace + '.' + ctx.typeName + '.', '');      
            if (name.indexOf('#ctor') >= 0) {
                name = name.replace('#ctor', 'Constructor');
            }
            
            ctx.markdown.push('\n### ');
            ctx.markdown.push(name);
            ctx.markdown.push('\n');
        }
        
        process(ctx, memberNode);
    }

    function processSummary(ctx, summaryNode) {
        ctx.markdown.push('\n');
        process(ctx, summaryNode);
        ctx.markdown.push('\n');
    }
    
    function processValue(ctx, valueNode) {
        ctx.markdown.push('\n#### Value\n\n');
        process(ctx, valueNode);
        ctx.markdown.push('\n');
    }
    
    function processTypeparam(ctx, typeparamNode) {
        var name = typeparamNode.getAttribute('name');
        if (name) {
            if (ctx.previousNode !== 'typeparam') {
                ctx.markdown.push('\n#### Type Parameters\n\n');            
            }            
            ctx.markdown.push('- ');
            ctx.markdown.push(name);
            ctx.markdown.push(' - ');
            process(ctx, typeparamNode);
            ctx.markdown.push('\n');
        }
    }

    function processParam(ctx, paramNode) {
        var paramName = paramNode.getAttribute('name');
        var paramType = ctx.paramTypes[paramName];
        
        if (ctx.previousNode !== 'param') {
            ctx.markdown.push('\n| Name | Description |\n');
            ctx.markdown.push('| ---- | ----------- |\n');
        }        
        ctx.markdown.push('| ');
        ctx.markdown.push(paramName);
        ctx.markdown.push(' | *');
        if (paramType) {
            ctx.markdown.push(paramType);
        } else {
            ctx.markdown.push('Unknown type');
        }
        ctx.markdown.push('*<br>');
        process(ctx, paramNode);    
        ctx.markdown.push(' |\n');        
    }

    function processReturns(ctx, returnsNode) {
        ctx.markdown.push('\n#### Returns\n\n');
        process(ctx, returnsNode);
        ctx.markdown.push('\n');
    }

    function processRemarks(ctx, remarksNode) {
        ctx.markdown.push('\n#### Remarks\n\n');
        process(ctx, remarksNode);
        ctx.markdown.push('\n');
    }

    function processExample(ctx, exampleNode) {
        ctx.markdown.push('\n#### Example\n\n');
        process(ctx, exampleNode);
        ctx.markdown.push('\n');
    }
    
    function processPermission(ctx, permissionNode) {
        var cref = permissionNode.getAttribute('cref');        
        if (cref) {
            if (ctx.previousNode !== 'permission') {        
                ctx.markdown.push('\n#### Permissions\n\n');
            }
            
            var permissionName = sanitizeMarkdown(cref.substring(2));
            permissionName = permissionName.replace(ctx.namespace + '.', '');
            
            ctx.markdown.push('- ');
            ctx.markdown.push(permissionName);
            ctx.markdown.push(': ')
            process(ctx, permissionNode);            
            ctx.markdown.push('\n');
        }
    }

    function processException(ctx, exceptionNode) {
        var cref = exceptionNode.getAttribute('cref');
        if (cref) {
            var exName = sanitizeMarkdown(cref.substring(2));
            exName = exName.replace(ctx.namespace + '.', '');
            
            ctx.markdown.push('\n*');
            ctx.markdown.push(exName);
            ctx.markdown.push(':* ');        
            process(ctx, exceptionNode);
            ctx.markdown.push('\n');
        }
    }
    
    function processList(ctx, listNode) {
        var type = listNode.getAttribute('type');
        var newline = (ctx.nodeStack[ctx.nodeStack.length - 2] === 'param') ? '<br>' : '\n'; 
        if (type) {
            ctx.markdown.push(newline);            
            if (type === 'table') {
                var listheaderElement = findChildNode(listNode, 'listheader');
                var listheaderTermElements = findChildNodes(listheaderElement, 'term')
                ctx.markdown.push('| ');
                for (var i = 0; i < listheaderTermElements.length; i++) {
                    ctx.markdown.push(listheaderTermElements[i].textContent);
                    ctx.markdown.push(' | ');
                }
                ctx.markdown.push(newline);
                
                itemElements = findChildNodes(listNode, 'item');
                for (var i = 0; i < itemElements.length; i++) {
                    var itemTermElements = findChildNodes(itemElements[i], 'term');
                    ctx.markdown.push('| ');
                    for (var j = 0; j < itemTermElements.length; j++) {
                        process(ctx, itemTermElements[j])                        
                        ctx.markdown.push(' | ');
                    }
                    ctx.markdown.push(newline);
                }                
            } else {
                var prefixFn; 
                if (type === 'number') {
                    var counter = 1;
                    prefixFn = function() { return counter++ + '. '; };                    
                } else { // Bullet.                    
                    prefixFn = function() { return '- '; };
                }
                var itemElements = findChildNodes(listNode, 'item');
                for (var i = 0; i < itemElements.length; i++) {
                    var itemElement = itemElements[i];
                    ctx.markdown.push(prefixFn());                    
                    var termElement = findChildNode(itemElement, 'term');
                    if (termElement) {
                        process(ctx, termElement);
                        ctx.markdown.push(' - ');
                    }
                    var descriptionElement = findChildNode(itemElement, 'description');
                    if (descriptionElement) {
                        process(ctx, descriptionElement);
                    }
                    ctx.markdown.push(newline);
                }                
            }            
        }
    }
    
    function processCode(ctx, codeNode) {
        ctx.markdown.push('\n```\n');
        ctx.markdown.push(codeNode.textContent);
        ctx.markdown.push('\n```\n');
    }
    
    function processSeealso(ctx, seealsoNode) {
        if (ctx.previousNode !== 'seealso') {        
            ctx.markdown.push('\n#### See also\n');
        }
        ctx.markdown.push('\n- ');
        processSee(ctx, seealsoNode);
        ctx.markdown.push('\n');
    }
    
    function processParamref(ctx, paramrefNode) {
        var name = paramrefNode.getAttribute('name');
        if (name) {
            ctx.markdown.push(name);            
        }                
    }
    
    function processTypeparamref(ctx, typeparamrefNode) {
        var name = typeparamrefNode.getAttribute('name');
        if (name) {
            ctx.markdown.push(name);
        }                
    }    
    
    function processSee(ctx, seeNode) {
        var cref = seeNode.getAttribute('cref'); // For example: T:System.String        
        if (cref) { 
            var typeName = sanitizeMarkdown(cref.substring(2));
            typeName = typeName.replace(ctx.namespace + '.', '');
            ctx.markdown.push('<a href="#');
            ctx.markdown.push(typeName.toLowerCase());
            ctx.markdown.push('">')
            ctx.markdown.push(typeName);
            ctx.markdown.push('</a>');     
        } else {
            var href = seeNode.getAttribute('href'); // For example: http://stackoverflow.com/
            if (href) {                                
                ctx.markdown.push('<a href="');
                ctx.markdown.push(href);
                ctx.markdown.push('">')
                ctx.markdown.push(href);
                ctx.markdown.push('</a>');
            }     
        }                
    }   
    
    function processC(ctx, cNode) {
        ctx.markdown.push('`');
        ctx.markdown.push(cNode.textContent);
        ctx.markdown.push('`');
    }   
    
    function processText(ctx, textNode) {
        if (!ctx.previousNode || ctx.previousNode === 'list' || ctx.previousNode === 'code') {
            textNode.nodeValue = trimStart(textNode.nodeValue);
        }
        if (!ctx.nextNode) {
            textNode.nodeValue = trimEnd(textNode.nodeValue);
        }

        ctx.markdown.push(textNode.nodeValue.replace(/\s+/g, ' '));
    }
    
    function processPara(ctx, paraNode) {
        ctx.markdown.push('\n');
        process(ctx, paraNode);
        ctx.markdown.push('\n');
    }
    
    /****************/
    /* 2. Utilities */
    /****************/

    function rearrangeParametersInContext(ctx, memberNode) {
        var methodPrototype = memberNode.name;
        var matches = methodPrototype.match(/\((.*)\)/);
        if (!matches) {
            return methodPrototype;
        }        
                
        var paramString = matches[1].replace(' ', '');
        var paramTypes = paramString.split(',');
        if (paramTypes.length === 0) {
            return methodPrototype;
        }
        
        var paramNodes = findChildNodes(memberNode, 'param');        
        if (paramNodes.length === 0) {
            return methodPrototype;
        }
        
        var newParamString = '';
        for (var i = 0; i < paramNodes.length; i++) {
            var paramNode = paramNodes[i];
            var paramName = paramNode.getAttribute('name');
            var paramType = paramTypes[i];
            newParamString += newParamString ? ', ' : '';
            newParamString += paramName;
            ctx.paramTypes[paramName] = paramType;
        }
        
        var newMethodPrototype = methodPrototype.replace(/\(.*\)/, '(' + newParamString + ')');
        return newMethodPrototype;
    }
    
    function trimStart(value) {
        return value.replace(/^\s+/, '');
    }
    
    function trimEnd(value) {
        return value.replace(/\s+$/, '');
    }
    
    function sanitizeMarkdown(value) {
        return value.replace(/`/g, '\\`');
    }
    
    function findChildNode(node, nodeName) {
        var childNodes = findChildNodes(node, nodeName);
        return childNodes ? childNodes[0] : undefined;
    }
    
    function findChildNodes(node, nodeName) {
        var result = [];
        if (node) {
            for (var i = 0; i < node.childNodes.length; i++) {
                var childNode = node.childNodes[i];
                if (childNode.nodeName === nodeName) {
                    result = result || [];
                    result.push(childNode);
                }
            }
        }
        return result;
    }
    
    // Ref: http://stackoverflow.com/a/5817243/1466456    
    function stripEmptyTextNodes(node) {
        var child, next;
        switch (node.nodeType) {
        case 3: // Text node
            if (/^\s*$/.test(node.nodeValue)) {
                node.parentNode.removeChild(node);
            }
            break;
        case 1: // Element node
        case 9: // Document node
            child = node.firstChild;
            while (child) {
                next = child.nextSibling;
                stripEmptyTextNodes(child);
                child = next;
            }
            break;
        }
    }
    
    function getTableOfContents(ctx) {
        var numTypes = ctx.types.length;
        var numTypesPerRow = 2;
        var numRows = Math.ceil(numTypes / numTypesPerRow);
        var tableOfContents = ['\n<table>\n<tbody>\n'];
        
        for (var i = 0; i < numRows; i++) {
            tableOfContents.push('<tr>\n');
            
            for (var j = 0; j < numTypesPerRow; j++) {
                var type = ctx.types[i*numTypesPerRow + j];
                if (type) {
                    tableOfContents.push('<td><a href="#');            
                    tableOfContents.push(type.toLowerCase());
                    tableOfContents.push('">');
                    tableOfContents.push(type);
                    tableOfContents.push('</a></td>\n');
                }
            }
            
            tableOfContents.push('</tr>\n');
        }
        
        tableOfContents.push('</tbody>\n</table>\n');
        return tableOfContents.join('');
    }
})();