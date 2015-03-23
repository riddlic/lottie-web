/****** INIT DOMAnimationMAnager ******/
(function(){
    var frameRate = 0;
    var totalFrames = 0;
    var firstFrame = 0;
    var currentRenderFrame = 0;
    var currentTime = 0;
    var imageCount = 0;
    var zCount = 0;
    var isRenderReady = false;
    var mainComp;
    var mainLayers = [];
    var filesDirectory;
    var callback;
    var pendingLayers = [];
    var totalLayers = 0;

    function getCompositionAnimationData(compo, compositionData,fDirectory){
        mainComp = compo;
        frameRate = mainComp.frameRate;
        currentRenderFrame = 0;
        imageCount = 0;
        zCount = 0;
        mainLayers = [];
        totalFrames = mainComp.workAreaDuration*mainComp.frameRate;
        firstFrame = mainComp.workAreaStart*mainComp.frameRate;
        //totalFrames = 1;
        var animationOb = {};
        compositionData.animation = animationOb;
        compositionData.assets = AssetsManager.getAssetsData();
        animationOb.layers = mainLayers;
        animationOb.totalFrames = totalFrames;
        animationOb.frameRate = frameRate;
        animationOb.ff = mainComp.workAreaStart;
        animationOb.compWidth = mainComp.width;
        animationOb.compHeight = mainComp.height;
        filesDirectory = fDirectory;
        iterateComposition();
    }

    function getMaskMode (num){
        switch(num){
            case MaskMode.NONE:
                return 'n';
            case MaskMode.ADD:
                return 'a';
            case MaskMode.SUBTRACT:
                return 's';
            case MaskMode.INTERSECT:
                return 'i';
            case MaskMode.LIGHTEN:
                return 'l';
            case MaskMode.DARKEN:
                return 'd';
            case MaskMode.DIFFERENCE:
                return 'f';
        }
    }

    function addMasksToLayer(layerInfo,layerOb,time){
        layerOb.mk = [];
        var i, len = layerInfo.mask.numProperties, maskShape, maskElement;
        for(i=0;i<len;i++){
            maskElement = layerInfo.mask(i+1);
            maskShape = layerInfo.mask(i+1).property('maskShape').valueAtTime(time,false);
            layerOb.mk.push({v:extrasInstance.roundNumber(maskShape.vertices,3), i:extrasInstance.roundNumber(maskShape.inTangents,3), o:extrasInstance.roundNumber(maskShape.outTangents,3), t:extrasInstance.roundNumber(maskElement.property('Mask Opacity').valueAtTime(time,false)/100,3)});
        }
    }

    function setMasks(masks,layerOb){
        layerOb.masksProperties = [];
        var i, len = masks.numProperties, maskShape, maskElement;
        for(i=0;i<len;i++){
            maskElement = masks(i+1);
            maskShape = maskElement.property('maskShape').value;
            var shapeData = {
                cl:maskShape.closed,
                inv:maskElement.inverted,
                mode:getMaskMode(maskElement.maskMode)
            };
            extrasInstance.convertToBezierValues(maskElement.property('maskShape'), frameRate, shapeData,'pt');
            extrasInstance.convertToBezierValues(maskElement.property('Mask Opacity'), frameRate, shapeData,'o');
            layerOb.masksProperties.push(shapeData);
        }
    }

    function addStillAsset(layerOb,layerInfo){
        layerOb.assetId = AssetsManager.exportFileFromLayer(layerInfo,filesDirectory);
    }

    function removeExtraData(layersData){
        var i, len = layersData.length,j, jLen, shapes;
        for(i = 0;i<len;i++){
            var layerOb = layersData[i];
            if(layerOb.enabled == false){
                layersData.splice(i,1);
                i -= 1;
                len -= 1;
                continue;
            }
            layerOb.lastData = null ;
            delete layerOb.lastData;
            if(layerOb.type == 'ShapeLayer'){
                shapes = layerOb.shapes;
                jLen = shapes.length;
                for(j=0;j<jLen;j++){
                    shapes[j].lastData = null;
                    delete shapes[j].lastData;
                }
            }
            if(layerOb.type == 'PreCompLayer'){
                removeExtraData(layerOb.layers);
            }
            EffectsParser.saveEffectData(layerOb);
        }
    }

    function processFinalData(layersData){
        var i, len = layersData.length;
        for(i = 0;i<len;i++){
            var layerOb = layersData[i];
            if(layerOb.type == 'ShapeLayer'){
                layerOb.rectData.w = extrasInstance.roundNumber(layerOb.rectData.r - layerOb.rectData.l,3);
                layerOb.rectData.h = extrasInstance.roundNumber(layerOb.rectData.b - layerOb.rectData.t,3);
            }
            if(layerOb.type == 'PreCompLayer'){
                processFinalData(layerOb.layers);
            }
        }
    }

    function buildTextData(textDocument){
        var textDataOb = {};
        textDataOb.font = textDocument.font;
        textDataOb.fontSize = textDocument.fontSize;
        textDataOb.fillColor = extrasInstance.arrayRgbToHex(textDocument.fillColor);
        textDataOb.text = textDocument.text;
        var justification = '';
        switch(textDocument.justification){
            case ParagraphJustification.LEFT_JUSTIFY:
                justification = 'left';
                break;
            case ParagraphJustification.RIGHT_JUSTIFY:
                justification = 'right';
                break;
            case ParagraphJustification.CENTER_JUSTIFY:
                justification = 'center';
                break;
            case ParagraphJustification.FULL_JUSTIFY_LASTLINE_LEFT:
            case ParagraphJustification.FULL_JUSTIFY_LASTLINE_RIGHT:
            case ParagraphJustification.FULL_JUSTIFY_LASTLINE_CENTER:
            case ParagraphJustification.FULL_JUSTIFY_LASTLINE_FULL:
                justification = 'justify';
                break;
            default:
                justification = 'left';
                break;
        }
        textDataOb.justification = justification;
        return textDataOb;
    }

    function analyzeNextLayer(){
        if(pendingLayers.length == 0){
            renderNextFrame();
        }else{
            var pendingItem = pendingLayers.pop();
            UI.setProgress(pendingLayers.length/totalLayers);
            var layerOb = pendingItem.lOb;
            var layerInfo = pendingItem.lInfo;
            var frameRate = pendingItem.frameRate;
            var lType = extrasInstance.layerType(layerInfo);
            if(lType == 'AudioLayer' || lType == 'CameraLayer' || layerInfo.enabled == false){
                //TODO add audios
                layerOb.enabled = false;
                analyzeNextLayer();
                return;
            }else if(lType == 'TextLayer'){
                var textProp = layerInfo.property("Source Text");
                var textDocument = textProp.value;
                layerOb.textData = buildTextData(textDocument);
                var r = layerInfo.sourceRectAtTime(0, false);
                layerOb.textData.xOffset = r.left;
                layerOb.textData.yOffset = r.top;
                layerOb.textData.width = r.width;
                layerOb.textData.height = r.height;
                //iterateProperty(layerInfo,0);
            }

            EffectsParser.createEffects(layerInfo,layerOb);

            if(layerInfo.mask.numProperties>0){
                setMasks(layerInfo.mask,layerOb);
                layerOb.hasMask = true;
            }
            layerOb.type = lType;
            if(lType == 'ShapeLayer'){
                ShapesParser.createShapes(layerInfo,layerOb, frameRate);
                layerOb.rectData = {l:0,t:0,b:0,r:0,w:0,h:0};
            }
            if(layerInfo.parent != null){
                layerOb.parent = layerInfo.parent.name;
            }
            layerOb.layerName = layerInfo.name;
            layerOb.threeD = layerInfo.threeDLayer;
            layerOb.an = {};

            if(lType=='PreCompLayer'){
                layerOb.width = layerInfo.source.width;
                layerOb.height = layerInfo.source.height;
            }else if(lType == 'StillLayer'){
                addStillAsset(layerOb,layerInfo);
                layerOb.width = layerInfo.source.width;
                layerOb.height = layerInfo.source.height;
            }else if(lType == 'SolidLayer'){
                layerOb.width = layerInfo.source.width;
                layerOb.height = layerInfo.source.height;
                layerOb.color = extrasInstance.arrayRgbToHex(layerInfo.source.mainSource.color);
            }else if(lType == 'ShapeLayer'){
                layerOb.width = layerInfo.width;
                layerOb.height = layerInfo.height;
            }
            layerOb.inPoint = layerInfo.inPoint*frameRate;
            layerOb.outPoint = layerInfo.outPoint*frameRate;
            layerOb.startTime = layerInfo.startTime*frameRate;
            layerOb.lastData = {};

            layerOb.ks = {};
            if(layerInfo.transform.opacity.numKeys>1){
                extrasInstance.convertToBezierValues(layerInfo.transform.opacity, frameRate, layerOb.ks,'o');
            }else{
                layerOb.ks.o = extrasInstance.roundNumber(layerInfo.transform.opacity.valueAtTime(0,false),3);
            }
            if(layerInfo.transform.rotation){
                if(layerInfo.transform.rotation.numKeys>1){
                    extrasInstance.convertToBezierValues(layerInfo.transform.rotation, frameRate, layerOb.ks,'r');
                }else{
                    layerOb.ks.r = extrasInstance.roundNumber(layerInfo.transform.rotation.valueAtTime(0,false),3);
                }
            }else{
                if(layerInfo.transform.xRotation.numKeys>1){
                    extrasInstance.convertToBezierValues(layerInfo.transform.xRotation, frameRate, layerOb.ks,'rx');
                }else{
                    layerOb.ks.rx = extrasInstance.roundNumber(layerInfo.transform.xRotation.valueAtTime(0,false),3);
                }
                if(layerInfo.transform.yRotation.numKeys>1){
                    extrasInstance.convertToBezierValues(layerInfo.transform.yRotation, frameRate, layerOb.ks,'ry');
                }else{
                    layerOb.ks.ry = extrasInstance.roundNumber(layerInfo.transform.yRotation.valueAtTime(0,false),3);
                }
                if(layerInfo.transform.zRotation.numKeys>1){
                    extrasInstance.convertToBezierValues(layerInfo.transform.zRotation, frameRate, layerOb.ks,'rz');
                }else{
                    layerOb.ks.rz = extrasInstance.roundNumber(layerInfo.transform.zRotation.valueAtTime(0,false),3);
                }
            }
            if(layerInfo.transform.position.numKeys>1){
                extrasInstance.convertToBezierValues(layerInfo.transform.position, frameRate, layerOb.ks,'p');
            }else{
                layerOb.ks.p = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(0,false),3);
            }
            if(layerInfo.transform['Anchor Point'].numKeys>1){
                extrasInstance.convertToBezierValues(layerInfo.transform['Anchor Point'], frameRate, layerOb.ks,'a');
            }else{
                layerOb.ks.a = extrasInstance.roundNumber(layerInfo.transform['Anchor Point'].valueAtTime(0,false),3);
            }
            if(layerInfo.transform['Scale'].numKeys>1){
                extrasInstance.convertToBezierValues(layerInfo.transform['Scale'], frameRate, layerOb.ks,'s');
            }else{
                layerOb.ks.s = extrasInstance.roundNumber(layerInfo.transform['Scale'].valueAtTime(0,false),3);
            }

            if(layerInfo.canSetTimeRemapEnabled && layerInfo.timeRemapEnabled){
                extrasInstance.convertToBezierValues(layerInfo['Time Remap'], frameRate, layerOb,'tm');
            }
            if(!renderCancelled){
                extrasInstance.setTimeout(analyzeNextLayer,100);
            }else{
                callback.apply();
            }
        }
    }

    function createLayers(compo, layersData, frameRate){
        var i, len = compo.layers.length;
        for(i = 0;i<len;i++){
            var layerOb = {};
            var layerInfo = compo.layers[i+1];
            var lType = extrasInstance.layerType(layerInfo);
            layersData.push(layerOb);
            if(lType == 'AudioLayer' || lType == 'CameraLayer' || layerInfo.enabled == false){
                //TODO add audios
                layerOb.enabled = false;
                continue;
            }
            pendingLayers.push({lInfo:layerInfo,lOb:layerOb,frameRate:frameRate});
            if(lType=='PreCompLayer'){
                layerOb.layers = [];
                createLayers(layerInfo.source,layerOb.layers,layerInfo.source.frameRate);
            }

        }
    }

    function getParentSize (name,layers){
        var i=0, len = layers.length;
        while(i<len){
            if(layers[i].layerName == name){
                return {width:layers[i].width,height:layers[i].height};
            }
            i++;
        }
        return {width:0,height:0};
    }

    function traverseAnimation(compo,layersData, frameNum, time){
        var i, len = compo.layers.length;
        for(i = 0;i<len;i++){
            var layerInfo = compo.layers[i+1];
            var lType = extrasInstance.layerType(layerInfo);
            if(lType == 'AudioLayer' || lType == 'CameraLayer' || layerInfo.enabled == false){
                //TODO add audios
                continue;
            }
            var layerOb = layersData[i];
            var animData = {};
            if(layerOb.hasMask){
                addMasksToLayer(layerInfo,animData,time);
            }
            animData.tr = {};
            animData.tr.p = [];
            animData.tr.a = [];
            animData.tr.r = [];
            animData.tr.s = [];
            animData.tr.o = {};

            if(layerOb.parent != null){
                var parentSize = getParentSize(layerOb.parent,layersData);
                animData.tr.p[0] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[0],3);
                animData.tr.p[1] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[1],3);
            }else{
                animData.tr.p[0] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[0],3);
                animData.tr.p[1] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[1],3);
            }
            if(layerOb.threeD){
                animData.tr.p[2] = extrasInstance.roundNumber(-layerInfo.transform.position.valueAtTime(time,false)[2],3);
            }else{
                animData.tr.p[2] = -zCount;
                zCount++;
            }
            if(lType=='ShapeLayer'){
                var r = layerInfo.sourceRectAtTime(frameNum, false);
                layerOb.rectData.l = extrasInstance.roundNumber(Math.min(r.left,layerOb.rectData.l),3);
                layerOb.rectData.t = extrasInstance.roundNumber(Math.min(r.top,layerOb.rectData.t),3);
                layerOb.rectData.r = extrasInstance.roundNumber(Math.max(r.left+r.width,layerOb.rectData.r),3);
                layerOb.rectData.b = extrasInstance.roundNumber(Math.max(r.top+r.height,layerOb.rectData.b),3);
            }
            animData.tr.a[0] = extrasInstance.roundNumber(layerInfo.transform['Anchor Point'].valueAtTime(time,false)[0],3);
            animData.tr.a[1] = extrasInstance.roundNumber(layerInfo.transform['Anchor Point'].valueAtTime(time,false)[1],3);
            animData.tr.a[2] = extrasInstance.roundNumber(-layerInfo.transform['Anchor Point'].valueAtTime(time,false)[2],3);
            animData.tr.s = extrasInstance.roundNumber([(layerInfo.transform['Scale'].valueAtTime(time,false)[0]/100),(layerInfo.transform['Scale'].valueAtTime(time,false)[1]/100),(layerInfo.transform['Scale'].valueAtTime(time,false)[2]/100)],3);
            if(layerOb.threeD){
                animData.tr.r[0] = extrasInstance.roundNumber((layerInfo.transform['X Rotation'].valueAtTime(time,false)+layerInfo.transform['Orientation'].valueAtTime(time,false)[0])*Math.PI/180,3);
                animData.tr.r[1] = extrasInstance.roundNumber(-(layerInfo.transform['Y Rotation'].valueAtTime(time,false)+layerInfo.transform['Orientation'].valueAtTime(time,false)[1])*Math.PI/180,3);
                animData.tr.r[2] = extrasInstance.roundNumber((layerInfo.transform['Rotation'].valueAtTime(time,false)+layerInfo.transform['Orientation'].valueAtTime(time,false)[2])*Math.PI/180,3);
            }else{
                animData.tr.r[0] = 0;
                animData.tr.r[1] = 0;
                animData.tr.r[2] = extrasInstance.roundNumber(layerInfo.transform['Rotation'].valueAtTime(time,false)*Math.PI/180,3);
            }
            animData.tr.o = extrasInstance.roundNumber(layerInfo.transform['Opacity'].valueAtTime(time,false)/100,3);
            if(lType == 'ShapeLayer'){
                ShapesParser.addFrameData(layerInfo,layerOb, frameNum, time);
            }
            if(lType == 'PreCompLayer'){
                var compoInTime = -layerInfo.startTime;
                traverseAnimation(layerInfo.source,layerOb.layers, frameNum, time+compoInTime);
            }
            //THIS IS REPLACED WITH THE KEYFRAMES. LEAVE THIS FOR NOW.
            /*if(layerOb.lastData.an == null || extrasInstance.compareObjects(animData,layerOb.lastData.an)==false){
             layerOb.an[frameNum] = animData;
             layerOb.lastData.an = animData;
             }*/
            EffectsParser.renderFrame(layerOb,frameNum);
        }
    }

    function iterateComposition(){
        createLayers(mainComp, mainLayers, mainComp.frameRate);
        // TO TRAVERSE LAYER BY LAYER. NEEDED FOR TIME REMAP?
        /*renderCompo(mainComp, mainLayers);
         AssetsManager.createAssetsDataForExport();
         removeExtraData(mainLayers);
         processFinalData(mainLayers);
         callback.apply();*/
        // END TO TRAVERSE LAYER BY LAYER. NEEDED FOR TIME REMAP?
        totalLayers = pendingLayers.length;
        analyzeNextLayer();
    }

    function iterateLayer(layerInfo, layerOb,frameRate){
        var duration =layerInfo.duration;
        layerOb.st = layerInfo.startTime;
        var frameNum = 0;
        var time = layerInfo.startTime;

        var lType = extrasInstance.layerType(layerInfo);
        if(lType == 'AudioLayer' || lType == 'CameraLayer' || layerInfo.enabled == false){
            //TODO add audios
            return;
        }
        while(frameNum < duration*frameRate){
            var layerOb = layersData[i];
            var animData = {};
            if(layerOb.hasMask){
                addMasksToLayer(layerInfo,animData,time);
            }
            animData.tr = {};
            animData.tr.p = [];
            animData.tr.a = [];
            animData.tr.r = [];
            animData.tr.s = [];
            animData.tr.o = {};

            if(layerOb.parent != null){
                var parentSize = getParentSize(layerOb.parent,layersData);
                animData.tr.p[0] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[0],3);
                animData.tr.p[1] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[1],3);
            }else{
                animData.tr.p[0] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[0],3);
                animData.tr.p[1] = extrasInstance.roundNumber(layerInfo.transform.position.valueAtTime(time,false)[1],3);
            }
            if(layerOb.threeD){
                animData.tr.p[2] = extrasInstance.roundNumber(-layerInfo.transform.position.valueAtTime(time,false)[2],3);
            }else{
                animData.tr.p[2] = -zCount;
                zCount++;
            }
            if(lType=='ShapeLayer'){
                var r = layerInfo.sourceRectAtTime(frameNum, false);
                layerOb.rectData.l = extrasInstance.roundNumber(Math.min(r.left,layerOb.rectData.l),3);
                layerOb.rectData.t = extrasInstance.roundNumber(Math.min(r.top,layerOb.rectData.t),3);
                layerOb.rectData.r = extrasInstance.roundNumber(Math.max(r.left+r.width,layerOb.rectData.r),3);
                layerOb.rectData.b = extrasInstance.roundNumber(Math.max(r.top+r.height,layerOb.rectData.b),3);
            }
            animData.tr.a[0] = extrasInstance.roundNumber(layerInfo.transform['Anchor Point'].valueAtTime(time,false)[0],3);
            animData.tr.a[1] = extrasInstance.roundNumber(layerInfo.transform['Anchor Point'].valueAtTime(time,false)[1],3);
            animData.tr.a[2] = extrasInstance.roundNumber(-layerInfo.transform['Anchor Point'].valueAtTime(time,false)[2],3);
            animData.tr.s = extrasInstance.roundNumber([(layerInfo.transform['Scale'].valueAtTime(time,false)[0]/100),(layerInfo.transform['Scale'].valueAtTime(time,false)[1]/100),(layerInfo.transform['Scale'].valueAtTime(time,false)[2]/100)],3);
            if(layerOb.threeD){
                animData.tr.r[0] = extrasInstance.roundNumber((layerInfo.transform['X Rotation'].valueAtTime(time,false)+layerInfo.transform['Orientation'].valueAtTime(time,false)[0])*Math.PI/180,3);
                animData.tr.r[1] = extrasInstance.roundNumber(-(layerInfo.transform['Y Rotation'].valueAtTime(time,false)+layerInfo.transform['Orientation'].valueAtTime(time,false)[1])*Math.PI/180,3);
                animData.tr.r[2] = extrasInstance.roundNumber((layerInfo.transform['Rotation'].valueAtTime(time,false)+layerInfo.transform['Orientation'].valueAtTime(time,false)[2])*Math.PI/180,3);
            }else{
                animData.tr.r[0] = 0;
                animData.tr.r[1] = 0;
                animData.tr.r[2] = extrasInstance.roundNumber(layerInfo.transform['Rotation'].valueAtTime(time,false)*Math.PI/180,3);
            }
            animData.tr.o = extrasInstance.roundNumber(layerInfo.transform['Opacity'].valueAtTime(time,false)/100,3);
            if(lType == 'ShapeLayer'){
                ShapesParser.addFrameData(layerInfo,layerOb, frameNum, time);
            }
            //THIS IS REPLACED WITH THE KEYFRAMES. BUT SHOULD BE USED FOR EXPRESSION LAYERS.
            if(layerOb.lastData.an == null || extrasInstance.compareObjects(animData,layerOb.lastData.an)==false){
                layerOb.an[frameNum] = animData;
                layerOb.lastData.an = animData;
            }
            //END FOR EXPRESSION LAYERS

            EffectsParser.renderFrame(layerOb,frameNum);
            frameNum += 1;
            time += 1/frameRate;
        }



        //traverseAnimation(layerInfo.source,layerOb.layers, frameNum, time+compoInTime);
        if(lType == 'PreCompLayer'){
            var i, len = layerInfo.source.layers.length;
            for(i = 0;i<len;i++){
                iterateLayer(layerInfo.source.layers[i+1],layerOb.layers[i],layerInfo.source.frameRate);
            }
        }
    }

    function renderCompo(compo, mainLayers){
        //var duration = compo.duration;
        var i, len = compo.layers.length;
        for(i = 0;i<len;i++){
            iterateLayer(compo.layers[i+1],mainLayers[i],compo.frameRate);
        }
    }

    function renderNextFrame(){
        /*if(currentRenderFrame < totalFrames && renderCancelled === false){
            renderFrame();
            currentRenderFrame +=1;
            renderNextFrame();
            //extrasInstance.setTimeout(renderNextFrame,50);
        }else{
            isRenderReady = true;
            checkRenderReady();
        }*/
        isRenderReady = true;
        checkRenderReady();
    }

    function checkRenderReady(){
        if(AsyncManager.getAsyncCounter() == 0 && isRenderReady == true){
            AssetsManager.createAssetsDataForExport();
            removeExtraData(mainLayers);
            processFinalData(mainLayers);
            callback.apply();
        }
    }

    function renderFrame(){
        currentTime = (currentRenderFrame+firstFrame)/frameRate;
        zCount = 0;
        traverseAnimation(mainComp,mainLayers, currentRenderFrame,currentTime);
    }

    function setCallback(cb){
        callback = cb;
    }

    AsyncManager.setCallBack(checkRenderReady);

    var ob = {};
        ob.getCompositionAnimationData = getCompositionAnimationData;
        ob.setCallback = setCallback;

    DOMAnimationManager = ob;
}());
/****** END DOMAnimationMAnager ******/