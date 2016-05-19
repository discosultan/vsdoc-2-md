'use strict';

var Converter = (function () {
    return {
        markdownToHtml: function (markdown) {
            return marked(markdown);
        },

        vsdocToMarkdown: function (vsdoc) {
            var xml = new DOMParser().parseFromString(vsdoc, 'text/xml');
            var obj = parseXmlToObj(xml);

            console.log(obj);

            var context = {
                markdown: [] // Output will be appended here.
            };
            processDoc(context, obj);

            return context.markdown.join('');
        }
    }

    function processDoc(context, doc) {                
        if (!doc.members) {
            doc.members = [];
        }
        preprocessMembers(context, doc.members);

        context.assembly = doc.assembly;
        context.namespace = context.assembly;
        var typeMemberNames = doc.members
            .filter(function (member) { return member.type === 'T' })
            .map(function (typeMember) { return typeMember.shortName });
        if (typeMemberNames.length >= 2) {
            var prefix = sharedStart([typeMemberNames[0], typeMemberNames[1]]);
            // Remove the dot suffix.
            context.namespace = prefix.substring(0, prefix.length - 1);
        }

        console.log(context.assembly);
        console.log(context.namespace);

        context.markdown.push('\n# ');
        context.markdown.push(context.assembly);
        context.markdown.push('\n\n');
        processMembers(context, doc.members);
        context.lastNode = 'doc';
    }

    function preprocessMembers(context, members) {
        for (var i = 0; i < members.length; i++) {
            var member = members[i];
            member.type = member.name.substring(0, 1);
            member.shortName = member.name.substring(2);
            if (member.shortName === '#ctor') {
                member.shortName = 'Constructor';
            }
        }
    }

    function processMembers(context, members) {
        preprocess(context, members);

        members.sort(function (a, b) { return a.shortName.localeCompare(b.shortName); });
        for (var i = 0; i < members.length; i++) {
            processMember(context, members[i]);
        }
        context.lastNode = 'members';
    }

    function processMember(context, member) {
        preprocess(context, member);

        console.log(member.type);

        if (member.type === 'M') {
            rearrangeParametersInContext(context, member);
        } else if (member.type === 'T') {
            context.markdown.push('\n## ');
            context.markdown.push(member.shortName);
            context.markdown.push('\n\n');
        } else {
            context.markdown.push('\n### ');
            context.markdown.push(member.shortName);
            context.markdown.push('\n\n');
        }

        context.lastNode = 'member';
    }

    function processSummary(context, summary) {
        context.lastNode = 'summary';
    }

    function processParam(context, param) {
        context.lastNode = 'param';
    }

    function processReturns(context, returns) {
        context.lastNode = 'returns';
    }

    function processRemarks(context, remarks) {
        context.lastNode = 'remarks';
    }

    function processException(context, exception) {
        context.lastNode = 'excepton';
    }

    function preprocess(context, obj) {
        if (context.lastNode === 'param') {
            context.markdown.push('\n');
        }
    }

    function rearrangeParametersInContext(context, member) {

    }

    // Ref: https://andrew.stwrt.ca/posts/js-xml-parsing/
    // flattens an object (recursively!), similarly to Array#flatten
    // e.g. flatten({ a: { b: { c: "hello!" } } }); // => "hello!"
    function flatten(object) {
        var check = _.isPlainObject(object) && _.size(object) === 1;
        return check ? flatten(_.values(object)[0]) : object;
    }

    // Ref: https://andrew.stwrt.ca/posts/js-xml-parsing/
    function parseXmlToObj(xml) {
        var data = {};

        var isText = xml.nodeType === 3,
            isElement = xml.nodeType === 1,
            body = xml.textContent && xml.textContent.trim(),
            hasChildren = xml.children && xml.children.length,
            hasAttributes = xml.attributes && xml.attributes.length;

        // if it's text just return it
        if (isText) { return xml.nodeValue.trim(); }

        // if it doesn't have any children or attributes, just return the contents
        if (!hasChildren && !hasAttributes) { return body; }

        // if it doesn't have children but _does_ have body content, we'll use that
        if (!hasChildren && body.length) { data.text = body; }

        // if it's an element with attributes, add them to data.attributes
        if (isElement && hasAttributes) {
            data.attributes = _.reduce(xml.attributes, function (obj, name, id) {
                var attr = xml.attributes.item(id);
                obj[attr.name] = attr.value;
                return obj;
            }, {});
        }

        // recursively call #parseXmlToObj over children, adding results to data
        _.each(xml.children, function (child) {
            var name = child.nodeName;

            // if we've not come across a child with this nodeType, add it as an object
            // and return here
            if (!_.has(data, name)) {
                data[name] = parseXmlToObj(child);
                return;
            }

            // if we've encountered a second instance of the same nodeType, make our
            // representation of it an array
            if (!_.isArray(data[name])) { data[name] = [data[name]]; }

            // and finally, append the new child
            data[name].push(parseXmlToObj(child));
        });

        // if we can, let's fold some attributes into the body
        _.each(data.attributes, function (value, key) {
            if (data[key] != null) { return; }
            data[key] = value;
            delete data.attributes[key];
        });

        // if data.attributes is now empty, get rid of it
        if (_.isEmpty(data.attributes)) { delete data.attributes; }

        // simplify to reduce number of final leaf nodes and return
        return flatten(data);
    }

    // Ref: http://stackoverflow.com/a/1917041/1466456
    function sharedStart(array) {
        console.log(array);
        var A = array.concat().sort(),
            a1 = A[0], a2 = A[A.length - 1], L = a1.length, i = 0;
        while (i < L && a1.charAt(i) === a2.charAt(i)) i++;
        return a1.substring(0, i);
    }
})();