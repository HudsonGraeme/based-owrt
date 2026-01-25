include $(TOPDIR)/rules.mk

PKG_NAME:=based-ui
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_MAINTAINER:=HudsonGraeme
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/package.mk

define Package/based-ui
  SECTION:=admin
  CATEGORY:=Administration
  TITLE:=Based - Modern OpenWrt Management Interface
  PKGARCH:=all
  DEPENDS:=+uhttpd +rpcd
endef

define Package/based-ui/description
  Modern web interface for OpenWrt routers.
  Pure vanilla JavaScript SPA using OpenWrt's native ubus API.
endef

define Build/Compile
endef

define Package/based-ui/install
	$(INSTALL_DIR) $(1)/www/custom
	$(INSTALL_DATA) ./dist/custom/index.html $(1)/www/custom/
	$(INSTALL_DATA) ./dist/custom/app.css $(1)/www/custom/

	$(INSTALL_DIR) $(1)/www/custom/js
	$(INSTALL_DATA) ./dist/custom/js/core.js $(1)/www/custom/js/

	$(INSTALL_DIR) $(1)/www/custom/js/modules
	$(INSTALL_DATA) ./dist/custom/js/modules/dashboard.js $(1)/www/custom/js/modules/
	$(INSTALL_DATA) ./dist/custom/js/modules/network.js $(1)/www/custom/js/modules/
	$(INSTALL_DATA) ./dist/custom/js/modules/system.js $(1)/www/custom/js/modules/
	$(INSTALL_DATA) ./dist/custom/js/modules/vpn.js $(1)/www/custom/js/modules/
	$(INSTALL_DATA) ./dist/custom/js/modules/services.js $(1)/www/custom/js/modules/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./rpcd-acl.json $(1)/usr/share/rpcd/acl.d/based-openwrt.json

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/based.config $(1)/etc/config/based
endef

define Package/based-ui/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/rpcd restart
	echo "Based UI installed. Access at http://[router-ip]/custom/"
}
endef

$(eval $(call BuildPackage,based-ui))
