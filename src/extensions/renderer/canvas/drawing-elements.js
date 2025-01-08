import * as math from '../../../math';

let CRp = {};

CRp.drawElement = function( context, ele, shiftToOriginWithBb, showLabel, showOverlay, showOpacity ){
  let r = this;

  if( ele.isNode() ){
    r.drawNode( context, ele, shiftToOriginWithBb, showLabel, showOverlay, showOpacity );
  } else {
    r.drawEdge( context, ele, shiftToOriginWithBb, showLabel, showOverlay, showOpacity );
  }
};

CRp.drawElementOverlay = function( context, ele ){
  let r = this;

  if( ele.isNode() ){
    r.drawNodeOverlay( context, ele );
  } else {
    r.drawEdgeOverlay( context, ele );
  }
};

CRp.drawElementUnderlay = function( context, ele ){
  let r = this;

  if( ele.isNode() ){
    r.drawNodeUnderlay( context, ele );
  } else {
    r.drawEdgeUnderlay( context, ele );
  }
};

CRp.drawCachedElementPortion = function( context, ele, eleTxrCache, pxRatio, lvl, reason, getRotation, getOpacity ){
  let r = this;
  let bb = eleTxrCache.getBoundingBox(ele);

  if( bb.w === 0 || bb.h === 0 ){ return; } // ignore zero size case

  let eleCache = eleTxrCache.getElement( ele, bb, pxRatio, lvl, reason );

  if( eleCache != null ){
    let opacity = getOpacity(r, ele);

    if( opacity === 0 ){ return; }

    let theta = getRotation(r, ele);
    let { x1, y1, w, h } = bb;
    let x, y, sx, sy, smooth;

    if( theta !== 0 ){
      let rotPt = eleTxrCache.getRotationPoint(ele);

      sx = rotPt.x;
      sy = rotPt.y;

      context.translate(sx, sy);
      context.rotate(theta);

      smooth = r.getImgSmoothing(context);

      if( !smooth ){ r.setImgSmoothing(context, true); }

      let off = eleTxrCache.getRotationOffset(ele);

      x = off.x;
      y = off.y;
    } else {
      x = x1;
      y = y1;
    }

    let oldGlobalAlpha;

    if( opacity !== 1 ){
      oldGlobalAlpha = context.globalAlpha;
      context.globalAlpha = oldGlobalAlpha * opacity;
    }

    context.drawImage( eleCache.texture.canvas, eleCache.x, 0, eleCache.width, eleCache.height, x, y, w, h );

    if( opacity !== 1 ){
      context.globalAlpha = oldGlobalAlpha;
    }

    if( theta !== 0 ){
      context.rotate(-theta);
      context.translate(-sx, -sy);

      if( !smooth ){ r.setImgSmoothing(context, false); }
    }
  } else {
    eleTxrCache.drawElement( context, ele ); // direct draw fallback
  }
};

const getZeroRotation = () => 0;
const getLabelRotation = (r, ele) => r.getTextAngle(ele, null);
const getSourceLabelRotation = (r, ele) => r.getTextAngle(ele, 'source');
const getTargetLabelRotation = (r, ele) => r.getTextAngle(ele, 'target');
const getOpacity = (r, ele) => ele.effectiveOpacity();
const getTextOpacity = (e, ele) => ele.pstyle('text-opacity').pfValue * ele.effectiveOpacity();

CRp.drawCachedElement = function( context, ele, pxRatio, extent, lvl, requestHighQuality ){
  let r = this;
  let { eleTxrCache, lblTxrCache, slbTxrCache, tlbTxrCache } = r.data;

  let bb = ele.boundingBox();
  let reason = requestHighQuality === true ? eleTxrCache.reasons.highQuality : null;

  if( bb.w === 0 || bb.h === 0 || !ele.visible() ){ return; }

  if( !extent || math.boundingBoxesIntersect( bb, extent ) ){
    let isEdge = ele.isEdge();
    let badLine = ele.element()._private.rscratch.badLine;

    r.drawElementUnderlay( context, ele );

    r.drawCachedElementPortion( context, ele, eleTxrCache, pxRatio, lvl, reason, getZeroRotation, getOpacity );

    if( !isEdge || !badLine ){
      r.drawCachedElementPortion( context, ele, lblTxrCache, pxRatio, lvl, reason, getLabelRotation, getTextOpacity );
    }

    if( isEdge && !badLine ){
      r.drawCachedElementPortion( context, ele, slbTxrCache, pxRatio, lvl, reason, getSourceLabelRotation, getTextOpacity );
      r.drawCachedElementPortion( context, ele, tlbTxrCache, pxRatio, lvl, reason, getTargetLabelRotation, getTextOpacity );
    }

    r.drawElementOverlay( context, ele );
  }
};

CRp.drawElements = function( context, eles ){
  let r = this;

  for( let i = 0; i < eles.length; i++ ){
    let ele = eles[ i ];

    r.drawElement( context, ele );
  }
};

CRp.drawCachedElements = function( context, eles, pxRatio, extent ){
  let r = this;

  if( !eles || eles.length === 0 ){
    console.log('[DEBUG] drawCachedElements: No elements, skip drawing');
    return;
  }

  // 1) Collect all edges in an array, so we can remove them as we draw them
  let remainingEdges = eles.filter(e => e.isEdge());

  // Helper: remove an edge from the array by setting it to null (or splice)
  function removeEdge(edge){
    let i = remainingEdges.indexOf(edge);
    if( i >= 0 ){
      remainingEdges[i] = null;
    }
  }

  // Recursive function
  function drawCompoundRecursive(node){
    // 1) Gather edges for 'node'
    let connectedEdges = [];
    for( let i = 0; i < remainingEdges.length; i++ ){
      let e = remainingEdges[i];
      if( !e ){ continue; }
      let src = e.source();
      let tgt = e.target();
      if( src === node || tgt === node ){
        connectedEdges.push(e);
      }
    }

    // 2) Draw node's edges behind the node
    for( let i = 0; i < connectedEdges.length; i++ ){
      let edge = connectedEdges[i];
      r.drawCachedElement( context, edge, pxRatio, extent );
      removeEdge(edge);
    }

    // 3) Draw the compound node itself
    r.drawCachedElement( context, node, pxRatio, extent );

    // 4) Recurse
    let childCompounds = node.children().filter( c => c.isParent());
    let childLeaves    = node.children().filter( c => !c.isParent());

    for( let i = 0; i < childCompounds.length; i++ ){
      let childCompound = childCompounds[i];
      drawCompoundRecursive(childCompound);
    }
    for( let i = 0; i < childLeaves.length; i++ ){
      r.drawCachedElement( context, childLeaves[i], pxRatio, extent );
    }
  }

  // 2) Top-level compounds & leaves
  let topLevelCompounds = eles.filter(e => e.isNode())
      .filter(n => n.isParent() && n.parent().empty());

  let topLevelLeaves = eles.filter(e => e.isNode())
      .filter(n => !n.isParent() && n.parent().empty());

  // 3) Draw top-level compounds (recursively handles child leaves)
  for( let i = 0; i < topLevelCompounds.length; i++ ){
    drawCompoundRecursive(topLevelCompounds[i]);
  }

  // 4) Now draw leftover edges -> behind top-level leaves
  //    but above any compounds we just drew
  for( let i = 0; i < remainingEdges.length; i++ ){
    let e = remainingEdges[i];
    if( e ){ // not null => not drawn yet
      r.drawCachedElement( context, e, pxRatio, extent );
    }
  }

  // 5) Finally, draw top-level leaves => they end up on top of leftover edges
  for( let i = 0; i < topLevelLeaves.length; i++ ){
    r.drawCachedElement( context, topLevelLeaves[i], pxRatio, extent );
  }
};




CRp.drawCachedNodes = function( context, eles, pxRatio, extent ){
  let r = this;

  for( let i = 0; i < eles.length; i++ ){
    let ele = eles[ i ];

    if( !ele.isNode() ){ continue; }

    r.drawCachedElement( context, ele, pxRatio, extent );
  }
};

CRp.drawLayeredElements = function( context, eles, pxRatio, extent ){
  let r = this;

  let layers = r.data.lyrTxrCache.getLayers( eles, pxRatio );
  if( layers ){
    for( let i = 0; i < layers.length; i++ ){
      let layer = layers[i];
      let bb = layer.bb;

      if( bb.w === 0 || bb.h === 0 ){ continue; }

      context.drawImage( layer.canvas, bb.x1, bb.y1, bb.w, bb.h );
    }
  } else { // fall back on plain caching if no layers
    r.drawCachedElements( context, eles, pxRatio, extent );
  }
};

if( process.env.NODE_ENV !== 'production' ){
  CRp.drawDebugPoints = function( context, eles ){
    let draw = function( x, y, color ){
      context.fillStyle = color;
      context.fillRect( x - 1, y - 1, 3, 3 );
    };

    for( let i = 0; i < eles.length; i++ ){
      let ele = eles[i];
      let rs = ele._private.rscratch;

      if( ele.isNode() ){
        let p = ele.position();

        draw( rs.labelX, rs.labelY, 'red' );
        draw( p.x, p.y, 'magenta' );
      } else {
        let pts = rs.allpts;

        for( let j = 0; j + 1 < pts.length; j += 2 ){
          let x = pts[ j ];
          let y = pts[ j + 1 ];

          draw( x, y, 'cyan' );
        }

        draw( rs.midX, rs.midY, 'yellow' );
      }
    }
  };
}

export default CRp;
