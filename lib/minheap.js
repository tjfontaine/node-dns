// Copyright 2012 Timothy J Fontaine <tjfontaine@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE

'use strict';

var Heap = function(max_nodes) {
  this.length = 0;
  this.root = undefined;
  this.max_nodes = max_nodes;
};

Heap.init = function(obj, key) {
  obj._parent = null;
  obj._left = null;
  obj._right = null;
  obj._key = key;
  return obj;
};

Heap.prototype.insert = function(obj, key) {
  var insert, node;

  this.length += 1;

  node = Heap.init(obj, key);

  if (!this.root) {
    this.root = node;
  } else {
    insert = this._last();

    node._parent = insert;

    if (!insert._left)
      insert._left = node;
    else
      insert._right = node;

    this._up(node);
  }

  this._head();
};

Heap.prototype.pop = function() {
  var ret, last;

  if (!this.root)
    return null;

  return this.remove(this.root);
};

Heap.prototype.remove = function(node) {
  var ret, last;

  ret = node;
  last = this._last();

  if (last._right)
    last = last._right;
  else
    last = last._left;

  this.length -= 1;

  if (!last) {
    if (ret == this.root)
      this.root = null;
    return ret;
  }

  this._delete_swap(ret, last);

  if (ret == this.root)
    this.root = last;

  this._down(last);
  this._head();

  return ret;
};

Heap.prototype._head = function() {
  if (!this.root)
    return;

  var tmp = this.root;
  while (tmp._parent) {
    tmp = tmp._parent;
  }

  this.root = tmp;
};

Heap.prototype._last = function() {
  var path, pos, mod, insert;

  pos = this.length;
  path = [];
  while (pos > 1) {
    mod = pos % 2;
    pos = Math.floor(pos / 2);
    path.push(mod);
  }

  insert = this.root;

  while (path.length > 1) {
    pos = path.pop();
    if (pos === 0)
      insert = insert._left;
    else
      insert = insert._right;
  }

  return insert;
};

Heap.prototype._swap = function(parent, child) {
  var cleft, cright, tparent;

  cleft = child._left;
  cright = child._right;

  if (parent._parent) {
    if (parent._parent._left == parent)
      parent._parent._left = child;
    else
      parent._parent._right = child;
  }

  child._parent = parent._parent;
  parent._parent = child;

  if (parent._left == child) {
    child._left = parent;
    child._right = parent._right;
    if (child._right)
      child._right._parent = child;
  } else {
    child._right = parent;
    child._left = parent._left;
    if (child._left)
      child._left._parent = child;
  }

  parent._left = cleft;
  parent._right = cright;

  if (parent._left)
    parent._left._parent = parent;

  if (parent._right)
    parent._right._parent = parent;
};

Heap.prototype._delete_swap = function(parent, child) {
  if (parent._left != child)
    child._left = parent._left;

  if (parent._right != child)
    child._right = parent._right;

  if (child._parent._left == child)
    child._parent._left = null;
  else
    child._parent._right = null;

  child._parent = parent._parent;

  if (child._left)
    child._left._parent = child;

  if (child._right)
    child._right._parent = child;

  parent._parent = null;
  parent._left = null;
  parent._right = null;
};

Heap.prototype._smallest = function(heap) {
  var small = heap;

  if (heap._left && heap._key > heap._left._key) {
    small = heap._left;
  }

  if (heap._right && small._key > heap._right._key) {
    small = heap._right;
  }

  return small;
};

Heap.prototype._up = function(node) {
  if (!node || !node._parent)
    return;

  var smallest = this._smallest(node._parent);

  if (smallest != node._parent) {
    this._swap(node._parent, node);
    this._up(node);
  }
};

Heap.prototype._down = function(node) {
  if (!node)
    return;

  var smallest = this._smallest(node);
  if (smallest != node) {
    this._swap(node, smallest);
    this._down(node);
  }
};

Heap.prototype.print = function() {
  Heap._print(this.root);
};

Heap._print = function(heap) {
  if (!heap)
    return;

  if (heap._left) {
    console.log('' + heap._key, '->', heap._left._key);
    Heap._print(heap._left);
  }

  if (heap._right) {
    console.log('' + heap._key, '->', heap._right._key);
    Heap._print(heap._right);
  }
};

module.exports = Heap;
