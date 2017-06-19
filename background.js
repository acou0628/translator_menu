"use strict";

(function () {
  const portName = "ytm-translate-port",
    translateAction = "translate",
    backAction = "back",
    dataAction = "data",
    selectAction = "select",
    initAction = "init";

  let lastContentTabIDs = [];
  let selectedIndex = 0;
  let workItems = [
    { tabIDs: [], reURL: /^https?:\/\/translate.google.com\/([?#]|$)/ },
    { tabIDs: [], reURL: /^https?:\/\/dictionary.cambridge.org\// },
    { tabIDs: [], reURL: /^https?:\/\/www.bing.com\/translator\// }
  ];

  function createTab(url, currentTab, callback) {
    chrome.tabs.create({
      active: true,
      index: currentTab.index + 1,
      url: url
    }, callback);
  }

  function translateTab(tabID, currentWindow, url, currentTab, callback) {
    chrome.tabs.get(tabID, tab => {
      if (tab.windowId != currentWindow.id) {
        callback(tab);
      } else if (tab.index == currentTab.index) {
        lastContentTabIDs.pop();
        callback(tab);
      } else if (tab.index == currentTab.index + 1) {
        callback(tab);
      } else {
        let index = tab.index < currentTab.index ? currentTab.index : currentTab.index + 1;
        chrome.tabs.move(tab.id, {
          index: index
        }, callback);
      }
    });
  }

  function callback(m) {
    return function (tabs) {
      let tab = Array.isArray(tabs) ? tabs[0] : tabs;
      chrome.windows.update(tab.windowId, {
        focused: true
      }, window => {
        chrome.tabs.update(tab.id, {
          active: true
        }, updateTab => {
          chrome.tabs.sendMessage(tab.id, m);
        });
      });
    }
  }

  function postMessage(m) {
    chrome.windows.getCurrent(currentWindow => {
      chrome.tabs.query({
        windowId: currentWindow.id,
        active: true
      }, activeTabs => {
        if (activeTabs.length == 0) {
          return;
        }
        if (isWorkTab(activeTabs[0]) == false) {
          lastContentTabIDs.length = 0;
        }
        lastContentTabIDs.push(activeTabs[0].id);

        let tabIDs = workItems[m.index].tabIDs;
        if (tabIDs.length == 0) {
          createTab(m.url, activeTabs[0], callback(m));
        } else {
          translateTab(tabIDs[0], currentWindow, m.url, activeTabs[0], callback(m));
        }
      });
    });
  }

  function connected(p) {
    if (p.name != portName) {
      return;
    }
    let portCS = p;
    portCS.onMessage.addListener(m => {
      switch (m.action) {
        case backAction:
          if (lastContentTabIDs.length > 0) {
            let lastContentTabID = lastContentTabIDs.pop();
            chrome.tabs.update(lastContentTabID, {
              active: true
            }, tab => {
              chrome.windows.update(tab.windowId, {
                focused: true
              });
            });
          }
          break;
        case dataAction:
          portCS.postMessage({
            action: dataAction,
            countPreviousPages: lastContentTabIDs.length,
            workItems: workItems.map(o => o.tabIDs.length),
            selectedIndex: selectedIndex
          });
          break;
        case translateAction:
          postMessage(m);
          break;
        case selectAction:
          selectedIndex = m.selectedIndex;
          break;
        case initAction:
          portCS.postMessage({
            action: initAction,
            workItems: workItems
          });
          break;
      }
    });
  }

  chrome.runtime.onConnect.addListener(connected);

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    let i = 0, p = 0;
    while (i < lastContentTabIDs.length) {
      if (p != i) {
        lastContentTabIDs[p] = lastContentTabIDs[i];
      }
      if (lastContentTabIDs[i] != tabId) {
        p++;
      }
      i++;
    }

    if (p != i) {
      lastContentTabIDs.length = p;
    }

    removeTab(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabID, changeInfo, tab) => {
    if ('url' in changeInfo) {
      appendTab(tab);
    }
  });

  chrome.windows.getAll({ populate: true }, windows => {
    for (let window of windows) {
      for (let tab of window.tabs) {
        appendTab(tab);
      }
    }
  });

  function removeTab(tabId) {
    for (let item of workItems) {
      let i = 0, p = 0;
      while (i < item.tabIDs.length) {
        if (p != i) {
          item.tabIDs[p] = item.tabIDs[i];
        }
        if (item.tabIDs[i] != tabId) {
          p++;
        }
        i++;
      }

      if (p != i) {
        item.tabIDs.length = p;
      }
    }
  }

  function appendTab(tab) {
    for (let item of workItems) {
      if (item.reURL.test(tab.url)) {
        if (item.tabIDs.findIndex(o => o == tab.id) == -1) {
          item.tabIDs.push(tab.id);
        }
      }
    }
  }

  function isWorkTab(tab) {
    for (let item of workItems) {
      if (item.reURL.test(tab.url)) {
        return true;
      }
    }
    return false;
  }

})();
